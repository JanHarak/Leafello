/**
 * Edge Function `suggest-plan` (Deno).
 *
 * Výživový poradce: podle denního cíle uživatele (kcal a makra z aktivního
 * cíle) navrhne jídelníček na JEDEN den (snídaně, oběd, večeře, svačina).
 * Vrací jen návrh k potvrzení; nic neukládá do plánu ani deníku.
 *
 * Bezpečnost: drží se zadaného cíle (ten už respektuje bezpečné kcal limity),
 * nikdy nedoporučuje hladovění ani extrémní omezování a nehodnotí uživatele.
 * Klíč Gemini je jen v Supabase secrets. Nasazení:
 *   supabase functions deploy suggest-plan
 */
// @ts-nocheck – Deno runtime, ne Node/Vitest.
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
    meals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          meal: { type: 'string' },
          items: {
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
        required: ['meal', 'items'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['meals'],
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json(401, { error: 'unauthorized' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey = Deno.env.get('GEMINI_API_KEY')!;

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id ?? '';
  if (!userId) return json(401, { error: 'unauthorized' });

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: goal } = await admin
    .from('goals')
    .select('kcal_target, protein_g, carbs_g, fat_g')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (!goal) return json(400, { error: 'no_goal' });

  const prompt =
    'Jsi zkušený výživový poradce. Navrhni vyvážený jídelníček na JEDEN den pro ' +
    `dospělého člověka s denním cílem ${goal.kcal_target} kcal, bílkoviny ${goal.protein_g} g, ` +
    `sacharidy ${goal.carbs_g} g, tuky ${goal.fat_g} g. Rozděl ho na snídani, oběd, večeři a ` +
    'svačinu (pole meal nabývá hodnot breakfast, lunch, dinner, snack). U každé položky uveď ' +
    'český název, odhad hmotnosti porce v gramech a výživové hodnoty na 100 g (kcal_100g, ' +
    'protein_100g, carbs_100g, fat_100g). Součet dne ať se blíží zadanému cíli. Používej běžné a ' +
    'dostupné potraviny. Nikdy nedoporučuj hladovění ani extrémní omezování, drž se zadaného ' +
    'cíle a nesnižuj ho, a nehodnoť postavu ani hmotnost uživatele. V poli notes uveď jednu ' +
    'krátkou větu s tipem.';

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
    console.error(`[suggest-plan] Gemini HTTP ${res.status}: ${bodyText.slice(0, 500)}`);
    return json(200, { status: 'failed', error: `Gemini ${res.status}` });
  }
  let parsed: unknown = null;
  try {
    const g = JSON.parse(bodyText);
    parsed = JSON.parse(g?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'null');
  } catch {
    parsed = null;
  }
  const meals = (parsed as { meals?: unknown[] } | null)?.meals;
  if (!Array.isArray(meals)) return json(200, { status: 'failed', error: 'parse' });

  return json(200, { status: 'done', ...(parsed as object) });
});
