// @ts-nocheck – Deno runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

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

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const vpub = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const vpriv = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const vsub = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@leafello.app';
  if (!vpub || !vpriv) return json(200, { status: 'failed', error: 'vapid' });
  webpush.setVapidDetails(vsub, vpub, vpriv);

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await userClient.auth.getUser();
  const userId = u?.user?.id ?? '';
  if (!userId) return json(401, { error: 'unauthorized' });

  const admin = createClient(url, service);
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: 'Leafello', body: 'Testovací notifikace ✅', url: '/' }),
      );
    } catch (e) {
      const st = (e as { statusCode?: number }).statusCode;
      if (st === 404 || st === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
    }
  }
  return json(200, { status: 'ok', count: (subs ?? []).length });
});
