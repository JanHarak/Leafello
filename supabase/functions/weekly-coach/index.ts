/**
 * Edge Function `weekly-coach` (Deno).
 *
 * AI kouč on-demand: pro přihlášeného uživatele vygeneruje týdenní přehled
 * (viz _shared/coach.ts) a uloží ho do `coach_summaries` (cache posledního).
 * Nasazení:  supabase functions deploy weekly-coach
 */
// @ts-nocheck – Deno runtime, ne Node/Vitest.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCoachSummary, type CoachKind } from '../_shared/coach.ts';

const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-lite-latest';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

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

  // Režim: 'daily' nebo 'weekly' (výchozí). Bere se z těla requestu.
  let kind: CoachKind = 'weekly';
  try {
    const body = await req.json();
    if (body?.kind === 'daily') kind = 'daily';
  } catch {
    // prázdné/nevalidní tělo → weekly
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const result = await buildCoachSummary(admin, userId, geminiKey, GEMINI_MODEL, kind);
  if (!result) return json(200, { status: 'failed', error: 'generation' });

  const { data: inserted } = await admin
    .from('coach_summaries')
    .insert({
      user_id: userId,
      kind,
      period_start: result.period_start,
      period_end: result.period_end,
      summary: result.summary,
    })
    .select('id, created_at')
    .single();

  return json(200, {
    status: 'ok',
    id: inserted?.id,
    kind,
    period_start: result.period_start,
    period_end: result.period_end,
    created_at: inserted?.created_at,
    summary: result.summary,
  });
});
