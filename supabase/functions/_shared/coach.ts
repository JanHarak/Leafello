/**
 * Sdílená logika AI kouče (Deno): spočítá agregáty za posledních 7 dní a nechá
 * Gemini napsat strukturovaný týdenní přehled. Používá ji on-demand funkce
 * `weekly-coach` i cron `weekly-coach-cron`. Neukládá – ukládá volající.
 *
 * Bezpečnost: podporující tón kouče, nikdy hladovění/extrémy, nehodnotí postavu.
 */
// @ts-nocheck – Deno runtime.

export const COACH_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    wins: { type: 'array', items: { type: 'string' } },
    tips: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'summary', 'tips'],
};

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface WeeklySummaryResult {
  period_start: string;
  period_end: string;
  summary: unknown;
}

/**
 * Vytvoří týdenní přehled pro jednoho uživatele. Vrací null, když se generování
 * nepovede (chyba Gemini nebo parsování) – volající to může přeskočit.
 */
export async function buildWeeklySummary(
  admin: any,
  userId: string,
  geminiKey: string,
  model: string,
): Promise<WeeklySummaryResult | null> {
  const today = new Date();
  const end = iso(today);
  const startD = new Date(today);
  startD.setDate(startD.getDate() - 6);
  const start = iso(startD); // 7denní okno včetně dneška
  const weightFromD = new Date(today);
  weightFromD.setDate(weightFromD.getDate() - 13);
  const weightFrom = iso(weightFromD);

  const [goalRes, diaryRes, weightRes, avatarRes, waterRes] = await Promise.all([
    admin.from('goals').select('kcal_target, protein_g, carbs_g, fat_g, water_ml, target_weight_kg').eq('user_id', userId).eq('is_active', true).maybeSingle(),
    admin.from('diary_entries').select('entry_date, snapshot').eq('user_id', userId).gte('entry_date', start),
    admin.from('weight_logs').select('logged_on, weight_kg').eq('user_id', userId).gte('logged_on', weightFrom).order('logged_on', { ascending: true }),
    admin.from('avatar_state').select('streak_days').eq('user_id', userId).maybeSingle(),
    admin.from('water_logs').select('logged_at, ml').eq('user_id', userId).gte('logged_at', `${start}T00:00:00Z`),
  ]);

  const goal = goalRes.data as { kcal_target: number; protein_g: number; carbs_g: number; fat_g: number; water_ml: number; target_weight_kg: number } | null;
  const entries = (diaryRes.data ?? []) as { entry_date: string; snapshot: { kcal?: number; protein?: number; carbs?: number; fat?: number } }[];
  const weights = (weightRes.data ?? []) as { logged_on: string; weight_kg: number }[];
  const streakDays = (avatarRes.data as { streak_days?: number } | null)?.streak_days ?? 0;
  const waters = (waterRes.data ?? []) as { logged_at: string; ml: number }[];

  const byDate: Record<string, { kcal: number; protein: number; carbs: number; fat: number }> = {};
  for (const e of entries) {
    const s = e.snapshot ?? {};
    const d = byDate[e.entry_date] ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    d.kcal += Number(s.kcal) || 0;
    d.protein += Number(s.protein) || 0;
    d.carbs += Number(s.carbs) || 0;
    d.fat += Number(s.fat) || 0;
    byDate[e.entry_date] = d;
  }
  const loggedDays = Object.keys(byDate).length;
  const sum = (f: (v: { kcal: number; protein: number; carbs: number; fat: number }) => number) =>
    Object.values(byDate).reduce((a, v) => a + f(v), 0);
  const avgKcal = loggedDays ? sum((v) => v.kcal) / loggedDays : 0;
  const avgProtein = loggedDays ? sum((v) => v.protein) / loggedDays : 0;
  const avgCarbs = loggedDays ? sum((v) => v.carbs) / loggedDays : 0;
  const avgFat = loggedDays ? sum((v) => v.fat) / loggedDays : 0;

  const waterByDate: Record<string, number> = {};
  for (const w of waters) {
    const d = w.logged_at.slice(0, 10);
    waterByDate[d] = (waterByDate[d] ?? 0) + (Number(w.ml) || 0);
  }
  const waterGoalDays = goal?.water_ml ? Object.values(waterByDate).filter((v) => v >= goal.water_ml).length : 0;

  const firstW = weights[0];
  const lastW = weights[weights.length - 1];
  const weightChange = firstW && lastW ? lastW.weight_kg - firstW.weight_kg : null;
  const toTarget = lastW && goal?.target_weight_kg != null ? lastW.weight_kg - goal.target_weight_kg : null;

  const facts: string[] = [];
  facts.push(`Zapsané dny (deník) za posledních 7 dní: ${loggedDays} ze 7.`);
  if (loggedDays > 0) {
    facts.push(`Průměrný denní příjem: ${r0(avgKcal)} kcal (bílkoviny ${r0(avgProtein)} g, sacharidy ${r0(avgCarbs)} g, tuky ${r0(avgFat)} g).`);
  }
  if (goal) {
    facts.push(`Denní cíl: ${goal.kcal_target} kcal (B ${goal.protein_g} g, S ${goal.carbs_g} g, T ${goal.fat_g} g, pití ${goal.water_ml} ml).`);
    if (loggedDays > 0) facts.push(`Plnění kalorického cíle: průměrně ${r0((avgKcal / goal.kcal_target) * 100)} % denního cíle.`);
  }
  facts.push(`Aktuální série (streak): ${streakDays} dní.`);
  facts.push(`Dny se splněným pitným cílem: ${waterGoalDays} ze 7.`);
  if (weightChange != null) {
    const dir = weightChange < 0 ? 'úbytek' : weightChange > 0 ? 'přírůstek' : 'beze změny';
    facts.push(`Váha: ${r1(lastW.weight_kg)} kg, za sledované období ${dir} ${r1(Math.abs(weightChange))} kg.`);
  } else if (lastW) {
    facts.push(`Poslední zvážení: ${r1(lastW.weight_kg)} kg.`);
  } else {
    facts.push('Váhu si uživatel v tomto období nezapsal.');
  }
  if (toTarget != null) {
    facts.push(`Do cílové hmotnosti (${r1(goal!.target_weight_kg)} kg) zbývá ${r1(Math.abs(toTarget))} kg.`);
  }

  const prompt =
    'Jsi laskavý a povzbudivý výživový kouč. Na základě FAKT o posledním týdnu napiš uživateli ' +
    'krátké české shrnutí týdne a 1–2 konkrétní, splnitelné tipy na příští týden. ' +
    'Vrať: headline (krátký povzbudivý nadpis, 2–4 slova), summary (2–4 věty, shrnutí týdne s ' +
    'konkrétními čísly z fakt), wins (1–3 krátké body, co se povedlo), tips (1–2 konkrétní tipy). ' +
    'Piš přátelsky, ve druhé osobě (ty). NIKDY nedoporučuj hladovění ani extrémní omezování, ' +
    'nehodnoť postavu ani hmotnost a nestraš. Pokud uživatel skoro nezapisoval, jemně ho povzbuď ' +
    'k pravidelnějšímu zápisu. Vycházej jen z uvedených fakt, nic si nevymýšlej.\n\nFAKTA:\n- ' +
    facts.join('\n- ');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: COACH_RESPONSE_SCHEMA },
    }),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    console.error(`[coach] Gemini HTTP ${res.status}: ${bodyText.slice(0, 300)}`);
    return null;
  }
  try {
    const g = JSON.parse(bodyText);
    const text = g?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const summary = JSON.parse(text);
    return { period_start: start, period_end: end, summary };
  } catch (e) {
    console.error('[coach] parse selhal:', e);
    return null;
  }
}
