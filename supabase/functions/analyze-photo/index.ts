/**
 * Edge Function `analyze-photo` (Deno).
 *
 * Tenká obálka nad otestovanou logikou z balíčku @dietapp/analyze-photo.
 * Rozhodování (autorizace, rate limit, retry, parsování) je v té logice a
 * je pokryté testy T-48 až T-56; tady se jen napojí HTTP, JWT, Storage,
 * Gemini a zápis do photo_analyses.
 *
 * Nasazení: `supabase functions deploy analyze-photo`. Klíč Gemini je jen
 * v Supabase secrets (GEMINI_API_KEY), nikdy v klientovi ani v repozitáři.
 *
 * Pozn.: tenhle soubor se spouští v Deno runtime, ne ve Vitestu. Ověřuje se
 * až po nasazení; jednotkové testy pokrývají importovanou logiku.
 */
// @ts-nocheck – Deno runtime, ne Node/Vitest.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  DEFAULT_DAILY_LIMIT,
  analyzePhoto,
  type GeminiResponse,
} from '../_shared/analyze.ts';

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-lite-latest';
const DAILY_LIMIT = Number(Deno.env.get('PHOTO_DAILY_LIMIT') ?? DEFAULT_DAILY_LIMIT);

// CORS: volá se z webového klienta (prohlížeč pošle preflight OPTIONS).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          estimated_grams: { type: 'number' },
          confidence: { type: 'number' },
          kcal_100g: { type: 'number' },
          protein_100g: { type: 'number' },
          carbs_100g: { type: 'number' },
          fat_100g: { type: 'number' },
        },
        required: ['name', 'estimated_grams'],
      },
    },
    not_food: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['items', 'not_food'],
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  const hasJwt = jwt.length > 0;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey = Deno.env.get('GEMINI_API_KEY')!;

  // Uživatel z JWT (RLS-scoped klient).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = hasJwt ? await userClient.auth.getUser() : { data: { user: null } };
  const userId = userData?.user?.id ?? '';

  let storagePath = '';
  try {
    const body = await req.json();
    storagePath = body?.storage_path ?? '';
  } catch {
    // ponecháme prázdné, logika vrátí odpovídající chybu
  }

  // Kolik analýz dnes – service klient obchází RLS jen pro počítání limitu.
  const admin = createClient(supabaseUrl, serviceKey);
  let usedToday = 0;
  if (userId) {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count } = await admin
      .from('photo_analyses')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', since.toISOString());
    usedToday = count ?? 0;
  }

  console.log(
    `[analyze-photo] start model=${GEMINI_MODEL} keyLen=${geminiKey?.length ?? 0} ` +
      `userId=${userId ? 'ano' : 'ne'} usedToday=${usedToday} path=${storagePath}`,
  );

  // Volání Gemini: stáhne fotku ze Storage a pošle ji jako inline data.
  const callGemini = async (): Promise<GeminiResponse> => {
    const { data: file, error } = await admin.storage.from('meal-photos').download(storagePath);
    if (error || !file) {
      console.error('[analyze-photo] download_failed', storagePath, error?.message ?? '');
      return { status: 500, text: 'download_failed' };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const base64 = btoa(binary);
    console.log(`[analyze-photo] fotka stažena, ${bytes.length} B`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: 'Rozpoznej jídlo na fotce a odhadni gramáž a výživové hodnoty.' },
              { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      }),
    });

    const bodyText = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(bodyText);
    } catch {
      // ponecháme null, níže se zaloguje surový text
    }

    if (!res.ok) {
      // Chyba od Gemini (neplatný klíč, špatný model, kvóta): zaloguj a
      // propiš stručně do raw, ať je příčina vidět i v odpovědi.
      console.error(`[analyze-photo] Gemini HTTP ${res.status}: ${bodyText.slice(0, 800)}`);
      const g = json as { error?: { message?: string; status?: string } } | null;
      const detail = g?.error?.message ?? bodyText.slice(0, 300);
      return { status: res.status, text: `Gemini ${res.status}: ${detail}` };
    }

    const g = json as
      | { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      | null;
    const text = g?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (text === '') {
      console.error(`[analyze-photo] prázdná odpověď Gemini (200): ${bodyText.slice(0, 800)}`);
    }
    return { status: res.status, text };
  };

  const result = await analyzePhoto(
    { storagePath, userId, hasJwt, usedToday, limit: DAILY_LIMIT },
    { callGemini },
  );
  console.log(`[analyze-photo] výsledek status=${result.body.status ?? result.body.error ?? '?'} http=${result.httpStatus}`);

  // Zaznamenej analýzu (nikdy neukládej do deníku – to potvrzuje uživatel).
  if (userId && (result.body.status === 'done' || result.body.status === 'failed')) {
    await admin.from('photo_analyses').insert({
      user_id: userId,
      storage_path: storagePath,
      model: GEMINI_MODEL,
      raw_response: result.body.raw ? { raw: result.body.raw } : (result.body.items ?? null),
      status: result.body.status,
    });
  }

  return new Response(JSON.stringify(result.body), {
    status: result.httpStatus,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
