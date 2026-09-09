/**
 * Edge Function `suggest-recipes` (Deno).
 *
 * Výživový poradce: podle vybrané fáze jídla (snídaně/oběd/večeře/svačina) a
 * surovin, které má uživatel k dispozici, navrhne 3 zdravé recepty. U každého
 * vrací název, postup (kroky) a suroviny s gramáží a výživou na 100 g, aby šel
 * recept zapsat do deníku i uložit. Nic sám neukládá.
 *
 * Bezpečnost: drží se rolí výživového poradce, nikdy nedoporučuje hladovění
 * ani extrémní omezování a nehodnotí postavu ani hmotnost uživatele. Když je
 * k dispozici aktivní cíl, používá ho jen pro rozumnou velikost porce.
 * Klíč Gemini je jen v Supabase secrets. Nasazení:
 *   supabase functions deploy suggest-recipes
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
    recipes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          steps: { type: 'array', items: { type: 'string' } },
          ingredients: {
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
        required: ['name', 'steps', 'ingredients'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['recipes'],
};

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'snídani',
  lunch: 'oběd',
  dinner: 'večeři',
  snack: 'svačinu',
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

  let meal = 'lunch';
  let ingredients = '';
  let allergies = '';
  try {
    const body = await req.json();
    const m = String(body?.meal ?? 'lunch');
    if (['breakfast', 'lunch', 'dinner', 'snack'].includes(m)) meal = m;
    ingredients = String(body?.ingredients ?? '').slice(0, 800);
    allergies = String(body?.allergies ?? '').slice(0, 500);
  } catch {
    // bez těla – obecný návrh pro oběd
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: goal } = await admin
    .from('goals')
    .select('kcal_target, protein_g, carbs_g, fat_g')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  const mealCs = MEAL_LABEL[meal] ?? 'jídlo';
  const prompt =
    'Jsi zkušený výživový poradce. Navrhni 3 různé ZDRAVÉ recepty na ' + mealCs + ' pro ' +
    'dospělého člověka. Vyjdi hlavně ze surovin, které má uživatel k dispozici, a doplň je ' +
    'jen běžnými základními potravinami (např. olej, sůl, voda, koření). U KAŽDÉHO receptu uveď: ' +
    'český název; postup jako pole kroků (steps), každý krok jedna stručná věta; a suroviny ' +
    '(ingredients) – u každé český název, odhad hmotnosti porce v gramech (grams) a výživové ' +
    'hodnoty na 100 g (kcal_100g, protein_100g, carbs_100g, fat_100g). Porce ať odpovídá jedné ' +
    'porci daného jídla. Recepty ať jsou realistické a připravitelné. Nikdy nedoporučuj ' +
    'hladovění ani extrémní omezování a nehodnoť postavu ani hmotnost uživatele. V poli notes ' +
    'uveď jednu krátkou větu s tipem.' +
    (goal
      ? ` Velikost porcí přizpsob přibližně dennímu cíli uživatele (${goal.kcal_target} kcal/den), ať ` +
        `${mealCs} tvoří rozumnou část dne.`
      : '') +
    (ingredients.trim() ? ` Dostupné suroviny: ${ingredients.trim()}.` : '') +
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
    console.error(`[suggest-recipes] Gemini HTTP ${res.status}: ${bodyText.slice(0, 500)}`);
    return json(200, { status: 'failed', error: `Gemini ${res.status}` });
  }
  let parsed: unknown = null;
  try {
    const g = JSON.parse(bodyText);
    parsed = JSON.parse(g?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'null');
  } catch {
    parsed = null;
  }
  const recipes = (parsed as { recipes?: unknown[] } | null)?.recipes;
  if (!Array.isArray(recipes)) return json(200, { status: 'failed', error: 'parse' });

  return json(200, { status: 'done', ...(parsed as object) });
});
