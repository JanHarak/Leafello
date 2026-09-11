/**
 * Edge Function `weekly-coach-cron` (Deno).
 *
 * Týdenní dávka AI kouče: projde uživatele s `profiles.coach_weekly = true` a
 * každému vygeneruje a uloží týdenní přehled (viz _shared/coach.ts). Spouští ji
 * plánovač (týdenní GitHub workflow) – NENÍ pro veřejnost: chrání ji sdílené
 * tajemství v hlavičce `x-cron-secret` (secret COACH_CRON_SECRET).
 *
 * Nasazení:  supabase functions deploy weekly-coach-cron --no-verify-jwt
 * (běží bez uživatelského JWT, autorizace je přes vlastní secret.)
 */
// @ts-nocheck – Deno runtime, ne Node/Vitest.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCoachSummary } from '../_shared/coach.ts';

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-lite-latest';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('COACH_CRON_SECRET') ?? '';
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return json(401, { error: 'unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey = Deno.env.get('GEMINI_API_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: profiles, error } = await admin.from('profiles').select('id').eq('coach_weekly', true);
  if (error) return json(500, { error: error.message });

  const ids = (profiles ?? []).map((p: { id: string }) => p.id);
  let ok = 0;
  let failed = 0;
  for (const userId of ids) {
    try {
      const result = await buildCoachSummary(admin, userId, geminiKey, GEMINI_MODEL, 'weekly');
      if (!result) {
        failed += 1;
        continue;
      }
      await admin.from('coach_summaries').insert({
        user_id: userId,
        kind: 'weekly',
        period_start: result.period_start,
        period_end: result.period_end,
        summary: result.summary,
      });
      ok += 1;
    } catch (e) {
      console.error('[weekly-coach-cron] user', userId, e);
      failed += 1;
    }
  }

  return json(200, { status: 'ok', total: ids.length, generated: ok, failed });
});
