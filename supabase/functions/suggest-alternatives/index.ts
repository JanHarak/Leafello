/**
 * Edge Function `suggest-alternatives` (Deno).
 *
 * K jedné položce jídla navrhne pár výživově podobných alternativ (výživový
 * poradce přes Gemini). Vrací jen návrhy k výběru; nic neukládá. Respektuje
 * zadané alergie/intolerance.
 *
 * Nasazení: supabase functions deploy suggest-alternatives
 */
// @ts-nocheck – Deno runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-lite-latest';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          kcal_100g: { type: 'number' },
          protein_100g: { type: 'number' },
          carbs_100g: { type: 'number' },
          fat_100g: { type: 'number' },
        },
        required: ['name', 'grams', 'kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g'],
      },
    },
  },
  required: ['alternatives'],
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json(401, { error: 'unauthorized' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const geminiKey = Deno.env.get('GEMINI_API_KEY')!;
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user?.id) return json(401, { error: 'unauthorized' });

  let name = '';
  let meal = '';
  let grams = 0;
  let allergies = '';
  try {
    const body = await req.json();
    name = String(body?.name ?? '').slice(0, 200);
    meal = String(body?.meal ?? '').slice(0, 40);
    grams = Number(body?.grams) || 0;
    allergies = String(body?.allergies ?? '').slice(0, 500);
  } catch {
    // bez těla není co nahrazovat
  }
  if (!name) return json(400, { error: 'no_item' });

  const mealCs: Record<string, string> = { breakfast: 'snídani', lunch: 'oběd', dinner: 'večeři', snack: 'svačinu' };
  const prompt =
    `Jsi výživový poradce. Navrhni 3 alternativy k jídlu „${name}“` +
    (meal ? ` pro ${mealCs[meal] ?? meal}` : '') +
    `. Alternativy ať jsou výživově podobné (podobné kalorie a makra jako ${grams || 100} g původního jídla), ` +
    'běžně dostupné. U každé uveď český název, odhad hmotnosti porce v gramech a hodnoty na 100 g ' +
    '(kcal_100g, protein_100g, carbs_100g, fat_100g).' +
    (allergies.trim() ? ` Vynech potraviny, na které je uživatel alergický nebo je netoleruje: ${allergies.trim()}.` : '');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
    }),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    console.error(`[suggest-alternatives] Gemini HTTP ${res.status}: ${bodyText.slice(0, 400)}`);
    return json(200, { status: 'failed', error: `Gemini ${res.status}` });
  }
  let parsed: unknown = null;
  try {
    const g = JSON.parse(bodyText);
    parsed = JSON.parse(g?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'null');
  } catch {
    parsed = null;
  }
  const alternatives = (parsed as { alternatives?: unknown[] } | null)?.alternatives;
  if (!Array.isArray(alternatives)) return json(200, { status: 'failed', error: 'parse' });
  return json(200, { status: 'done', alternatives });
});
