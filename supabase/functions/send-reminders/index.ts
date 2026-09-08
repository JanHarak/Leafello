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

const TZ = 'Europe/Prague';
const WINDOW_MIN = 15; // tolerance: pošli, když slot právě proběhl v tomto okně

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
const mealSchedule = () => [
  { hour: 8, minute: 0, meal: 'breakfast' },
  { hour: 12, minute: 30, meal: 'lunch' },
  { hour: 18, minute: 30, meal: 'dinner' },
];
const MEAL_CS: Record<string, string> = { breakfast: 'snídaně', lunch: 'oběd', dinner: 'večeře', snack: 'svačina' };

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
    .select('user_id, email, channel')
    .eq('email_reminders', true);
  if (error) return json(500, { error: error.message });

  let sent = 0;
  const planned: string[] = [];

  for (const p of prefs ?? []) {
    if (!p.email) continue;
    // Push kanál zatím neposílá e-mail; e-mail jde u 'email' a 'both'.
    if (p.channel === 'push') continue;
    const { data: goal } = await admin
      .from('goals')
      .select('water_ml')
      .eq('user_id', p.user_id)
      .eq('is_active', true)
      .maybeSingle();
    const waterMl = goal?.water_ml ?? 2000;

    const slots = [
      ...waterSchedule(waterMl).map((w, i) => ({ slot: `water-${i}`, min: w.hour * 60 + w.minute, body: `Čas se napít (~${w.ml} ml).` })),
      ...mealSchedule().map((m) => ({ slot: `meal-${m.meal}`, min: m.hour * 60 + m.minute, body: `Čas na jídlo: ${MEAL_CS[m.meal] ?? m.meal}.` })),
    ];

    for (const sdef of slots) {
      if (minutes < sdef.min || minutes > sdef.min + WINDOW_MIN) continue;
      // Bez e-mailového providera jen ohlásíme, co bychom poslali (sloty
      // se neoznačí jako odeslané, aby po přidání RESEND_API_KEY fungovaly hned).
      if (!resendKey) {
        planned.push(`${p.email}:${sdef.slot}`);
        continue;
      }
      // Idempotence: unikátní (user, slot, den). Konflikt = už odesláno.
      const ins = await admin.from('reminder_sends').insert({ user_id: p.user_id, slot: sdef.slot, sent_on: date }).select('slot');
      if (ins.error) continue;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: p.email, subject: 'DietApp – připomínka', html: `<p>${sdef.body}</p>` }),
      }).catch(() => {});
      sent += 1;
    }

    // Připomínka vážení: ráno v 8:00, jen když se uživatel 7+ dní nezvážil.
    const WEIGH_MIN = 8 * 60;
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
        const body = 'Už je to týden od posledního vážení. Když chceš, zvaž se dnes ráno – ideálně nalačno a ve stejný čas.';
        if (!resendKey) {
          planned.push(`${p.email}:weigh_in`);
        } else {
          const ins = await admin.from('reminder_sends').insert({ user_id: p.user_id, slot: 'weigh_in', sent_on: date }).select('slot');
          if (!ins.error) {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from, to: p.email, subject: 'DietApp – čas na vážení', html: `<p>${body}</p>` }),
            }).catch(() => {});
            sent += 1;
          }
        }
      }
    }
  }

  return json(200, { status: 'ok', now: { date, minutes }, sent, planned, resend: resendKey ? 'on' : 'off' });
});
