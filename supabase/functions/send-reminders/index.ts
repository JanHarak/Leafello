/**
 * Edge Function `send-reminders` (Deno).
 *
 * Rozešle e-mailové připomínky (F-13, web) uživatelům, kteří je mají zapnuté
 * (reminder_prefs.email_reminders). Spouští ji plánovač (pg_cron + pg_net)
 * každých ~10 minut; funkce sama pozná, které sloty právě „dozrály“, a pošle
 * e-mail jen jednou za den na slot (idempotence přes reminder_sends).
 *
 * Zabezpečení: nasazuje se s `--no-verify-jwt` a chrání ji sdílený tajný klíč
 * v hlavičce `x-cron-secret` (secret CRON_SECRET). E-maily posílá přes Resend
 * (secret RESEND_API_KEY, odesílatel RESEND_FROM). Bez RESEND_API_KEY funkce
 * jen zaloguje, co by poslala.
 *
 * Nasazení: `supabase functions deploy send-reminders --no-verify-jwt`.
 * Časy počítá v pásmu Europe/Prague (cílové publikum CZ/SK).
 */
// @ts-nocheck – Deno runtime, ne Node/Vitest.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@leafello.app';
const pushEnabled = VAPID_PUBLIC !== '' && VAPID_PRIVATE !== '';
if (pushEnabled) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const TZ = 'Europe/Prague';
const WINDOW_MIN = 15; // tolerance: pošli, když slot právě proběhl v tomto okně
const MAX_DAILY = 8; // F-13: nikdy víc než 8 notifikací denně celkem

function waterSchedule(goalMl: number, count = 5, startHour = 8, endHour = 20) {
  const phases = Math.max(2, Math.round(count));
  const span = endHour - startHour;
  let base = Math.round(goalMl / phases / 50) * 50;
  if (base <= 0) base = 50;
  if (goalMl - base * (phases - 1) <= 0) base = Math.max(50, Math.floor(goalMl / phases / 50) * 50);
  const out: { hour: number; minute: number; ml: number }[] = [];
  for (let i = 0; i < phases; i += 1) {
    const hour = startHour + Math.round((i * span) / (phases - 1));
    const ml = i < phases - 1 ? base : goalMl - base * (phases - 1);
    out.push({ hour, minute: 0, ml });
  }
  return out;
}
const MEAL_CS: Record<string, string> = { breakfast: 'snídaně', lunch: 'oběd', dinner: 'večeře', snack: 'svačina' };

const DEFAULT_TIMES = { waterStart: 8, waterEnd: 20, breakfast: '08:00', lunch: '12:30', dinner: '18:30', weigh: '08:00' };
function parseHM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return 8 * 60;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

function nowInTz(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return { date, minutes };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  if (cronSecret === '' || (req.headers.get('x-cron-secret') ?? '') !== cronSecret) {
    return json(401, { error: 'unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const from = Deno.env.get('RESEND_FROM') ?? 'DietApp <onboarding@resend.dev>';
  const admin = createClient(supabaseUrl, serviceKey);

  const { date, minutes } = nowInTz();
  const { data: prefs, error } = await admin
    .from('reminder_prefs')
    .select('user_id, email, channel, times')
    .eq('email_reminders', true);
  if (error) return json(500, { error: error.message });

  let sent = 0;
  const planned: string[] = [];

  for (const p of prefs ?? []) {
    const wantEmail = (p.channel === 'email' || p.channel === 'both') && !!p.email;
    const wantPush = (p.channel === 'push' || p.channel === 'both') && pushEnabled;

    // Odběry web push (jen když je chceme).
    const subs = wantPush
      ? ((await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', p.user_id)).data ?? [])
      : [];

    // Nic k doručení → přeskoč uživatele.
    if (!wantEmail && subs.length === 0) continue;

    const { data: goal } = await admin
      .from('goals')
      .select('water_ml')
      .eq('user_id', p.user_id)
      .eq('is_active', true)
      .maybeSingle();
    const waterMl = goal?.water_ml ?? 2000;
    const tm = { ...DEFAULT_TIMES, ...((p.times as Record<string, unknown>) ?? {}) };

    // Denní strop notifikací (F-13: nikdy víc než 8 denně celkem). Počítáme
    // už odeslané dnešní sloty a novými nepřekročíme limit.
    const { count: sentToday } = await admin
      .from('reminder_sends')
      .select('slot', { count: 'exact', head: true })
      .eq('user_id', p.user_id)
      .eq('sent_on', date);
    let budget = MAX_DAILY - (sentToday ?? 0);

    const sendPush = async (title: string, body: string): Promise<void> => {
      for (const subRow of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: subRow.endpoint, keys: { p256dh: subRow.p256dh, auth: subRow.auth } },
            JSON.stringify({ title, body, url: '/' }),
          );
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await admin.from('push_subscriptions').delete().eq('id', subRow.id);
          } else {
            console.error('[send-reminders] push selhal', subRow.id, status);
          }
        }
      }
    };

    const deliver = async (slot: string, subject: string, body: string): Promise<void> => {
      // Bez e-mailu i bez push odběrů není jak doručit.
      if (!wantEmail && subs.length === 0) return;
      // E-mail-only bez providera: jen ohlásíme (jako dosud), nic neoznačíme.
      if (wantEmail && !resendKey && subs.length === 0) {
        planned.push(`${p.email}:${slot}`);
        return;
      }
      if (budget <= 0) return;
      // Idempotence: unikátní (user, slot, den). Jeden zápis gatuje e-mail i
      // push (u 'both' jdou oba, ale mark je jeden).
      const ins = await admin.from('reminder_sends').insert({ user_id: p.user_id, slot, sent_on: date }).select('slot');
      if (ins.error) return;
      if (wantEmail && resendKey) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: p.email, subject, html: `<p>${body}</p>` }),
        }).catch(() => {});
      }
      if (subs.length > 0) await sendPush(subject, body);
      budget -= 1;
      sent += 1;
    };

    // Vážení má přednost (jen když se uživatel 7+ dní nezvážil).
    const WEIGH_MIN = parseHM(tm.weigh);
    if (minutes >= WEIGH_MIN && minutes <= WEIGH_MIN + WINDOW_MIN) {
      const { data: last } = await admin
        .from('weight_logs')
        .select('logged_on')
        .eq('user_id', p.user_id)
        .order('logged_on', { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastMs = last?.logged_on ? new Date(`${last.logged_on}T00:00:00Z`).getTime() : 0;
      const todayMs = new Date(`${date}T00:00:00Z`).getTime();
      const daysSince = lastMs ? Math.round((todayMs - lastMs) / 86400000) : 999;
      if (daysSince >= 7) {
        await deliver('weigh_in', 'DietApp – čas na vážení', 'Už je to týden od posledního vážení. Když chceš, zvaž se dnes ráno – ideálně nalačno a ve stejný čas.');
      }
    }

    const mealDefs = [
      { meal: 'breakfast', min: parseHM(tm.breakfast) },
      { meal: 'lunch', min: parseHM(tm.lunch) },
      { meal: 'dinner', min: parseHM(tm.dinner) },
    ];
    const slots = [
      ...waterSchedule(waterMl, 5, Number(tm.waterStart) || 8, Number(tm.waterEnd) || 20).map((w, i) => ({
        slot: `water-${i}`,
        min: w.hour * 60 + w.minute,
        body: `Čas se napít (~${w.ml} ml).`,
      })),
      ...mealDefs.map((m) => ({ slot: `meal-${m.meal}`, min: m.min, body: `Čas na jídlo: ${MEAL_CS[m.meal] ?? m.meal}.` })),
    ];
    for (const sdef of slots) {
      if (minutes < sdef.min || minutes > sdef.min + WINDOW_MIN) continue;
      await deliver(sdef.slot, 'DietApp – připomínka', sdef.body);
    }
  }

  return json(200, { status: 'ok', now: { date, minutes }, sent, planned, resend: resendKey ? 'on' : 'off' });
});
