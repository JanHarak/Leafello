# Web Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the existing reminders (water/meals/weigh-in) as web push notifications by adding a push delivery channel to the current `send-reminders` engine.

**Architecture:** Reuse the existing reminder engine (slots, idempotency, daily cap) and add web push as a second channel. Net-new: a `push_subscriptions` table, service-worker `push`/`notificationclick` handlers, a client subscribe flow wired to the existing channel selector, and a push branch in `send-reminders` using `web-push` with VAPID. Native reminders stay on on-device local notifications (unchanged); server Expo push is out of scope.

**Tech Stack:** Expo (React Native + react-native-web, Expo Router), Supabase (Postgres + RLS, Deno Edge Functions), Web Push API (VAPID), `web-push` (npm) on the edge.

**Spec:** `docs/superpowers/specs/2026-09-11-web-push-notifications-design.md`

## Global Constraints

- No hardcoded colors outside `app/src/theme.ts` (checked by `node scripts/lint-styles.mjs`). Use theme tokens.
- i18n: every user-facing string added to all three locales `app/src/locales/{cs,en,sk}.json`; resolve via `t('...')`.
- TypeScript must pass: `cd app && npx tsc --noEmit`.
- Web build must export: `cd app && npx expo export --platform web`.
- Edge functions are Deno with `// @ts-nocheck`; deploy with `npx supabase functions deploy <name> --project-ref finmrsqojucsotpbbaaf` (add `--no-verify-jwt` for cron-secret functions).
- Migrations apply via `node scripts/db-push.mjs` (idempotent, skips already-applied).
- Commit after each task. Do NOT commit `.github/workflows/*` (push token lacks the `workflow` scope) — leave workflow files for the user to add manually.
- Push delivery itself cannot be verified in this environment (no browser/push service); it is verified manually after deploy (Task 6). Automated checks are lint/tsc/expo-export.

---

### Task 1: `push_subscriptions` table (migration)

**Files:**
- Create: `supabase/migrations/0020_push_subscriptions.sql`

**Interfaces:**
- Produces: table `push_subscriptions(id uuid pk, user_id uuid, endpoint text unique, p256dh text, auth text, user_agent text, created_at timestamptz)` with RLS policy `push_subscriptions_own`.

- [ ] **Step 1: Write the migration**

```sql
-- 0020_push_subscriptions.sql
-- Web push: odběry prohlížečů/zařízení pro připomínky. Jeden řádek na
-- prohlížeč (endpoint unikátní). Vlastní řádky vidí/spravuje uživatel; odesílač
-- (service-role) čte napříč uživateli.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_own on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index push_subscriptions_user_idx on push_subscriptions (user_id);
```

- [ ] **Step 2: Apply the migration**

Run: `node scripts/db-push.mjs`
Expected: `+ aplikuji 0020_push_subscriptions.sql ... OK`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0020_push_subscriptions.sql
git commit -m "DB: push_subscriptions table for web push"
```

---

### Task 2: Service worker push handlers

**Files:**
- Modify: `app/public/sw.js`

**Interfaces:**
- Consumes: push payload JSON `{ title: string, body: string, url?: string }`.
- Produces: the SW displays notifications and focuses/opens the app on click.

- [ ] **Step 1: Replace `app/public/sw.js` with the push-capable version**

```js
/*
 * Service worker – PWA instalovatelnost + web push notifikace připomínek.
 * Záměrně bez offline cache (ať se uživatelé nezaseknou na staré verzi).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // passthrough (síťové chování prohlížeče)
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || 'Leafello';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
```

- [ ] **Step 2: Verify the web bundle still exports (sw.js is copied to dist)**

Run: `cd app && npx expo export --platform web`
Expected: `Exported: dist`, and `dist/sw.js` contains the `push` handler.
Check: `grep -c "addEventListener('push'" dist/sw.js` → `1`

- [ ] **Step 3: Commit**

```bash
git add app/public/sw.js
git commit -m "SW: add push and notificationclick handlers"
```

---

### Task 3: Client push module (db helpers + lib/push.ts)

**Files:**
- Modify: `app/src/lib/db.ts` (append push subscription helpers)
- Create: `app/src/lib/push.ts`

**Interfaces:**
- Consumes: table `push_subscriptions` (Task 1); `EXPO_PUBLIC_VAPID_PUBLIC_KEY` env; the registered service worker.
- Produces (db.ts): `upsertPushSubscription(userId: string, sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null }): Promise<void>`, `deletePushSubscriptionByEndpoint(endpoint: string): Promise<void>`.
- Produces (push.ts): `pushSupported(): boolean`, `getPushStatus(): Promise<'unsupported' | 'denied' | 'subscribed' | 'default'>`, `subscribeWebPush(userId: string): Promise<boolean>`, `unsubscribeWebPush(): Promise<void>`.

- [ ] **Step 1: Append the db helpers to `app/src/lib/db.ts`**

Add at the end of the file (uses the same `supabase` client the file already imports):

```ts
/* -------------------------------------------------------------------------- */
/* Web push – odběry prohlížečů (F-13)                                         */
/* -------------------------------------------------------------------------- */

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

/** Uloží/aktualizuje odběr web push (jeden řádek na endpoint). */
export async function upsertPushSubscription(userId: string, sub: PushSubscriptionInput): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent ?? null,
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
}

/** Smaže odběr web push podle endpointu (RLS pustí jen vlastní). */
export async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw error;
}
```

- [ ] **Step 2: Create `app/src/lib/push.ts`**

```ts
import { Platform } from 'react-native';

import { deletePushSubscriptionByEndpoint, upsertPushSubscription } from './db';

// Veřejný VAPID klíč se do web buildu vloží přes env s prefixem EXPO_PUBLIC_.
const VAPID_PUBLIC = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export type PushStatus = 'unsupported' | 'denied' | 'subscribed' | 'default';

/** Web push je jen na webu s podporou SW + PushManager + Notification + VAPID. */
export function pushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    VAPID_PUBLIC !== ''
  );
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'default';
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Vyžádá povolení, vytvoří odběr a uloží ho. Vrací true při úspěchu. */
export async function subscribeWebPush(userId: string): Promise<boolean> {
  if (!pushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys) return false;
  await upsertPushSubscription(userId, {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    userAgent: navigator.userAgent,
  });
  return true;
}

/** Zruší odběr v prohlížeči i v DB. */
export async function unsubscribeWebPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const { endpoint } = sub;
  await sub.unsubscribe();
  await deletePushSubscriptionByEndpoint(endpoint);
}
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: no errors. (DOM globals `navigator`/`window`/`Notification`/`atob` are available because the app already uses `navigator`/`document` in `_layout.tsx`, so the DOM lib is in tsconfig.)

- [ ] **Step 4: Verify web export**

Run: `cd app && npx expo export --platform web`
Expected: `Exported: dist`

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/db.ts app/src/lib/push.ts
git commit -m "Client: web push subscribe/unsubscribe helpers"
```

---

### Task 4: Wire the reminders channel selector to push + i18n

**Files:**
- Modify: `app/src/app/reminders.tsx`
- Modify: `app/src/locales/cs.json`, `app/src/locales/en.json`, `app/src/locales/sk.json`

**Interfaces:**
- Consumes: `subscribeWebPush`, `pushSupported`, `getPushStatus` from `@/lib/push` (Task 3); `useAuth().session`.
- Produces: when the user selects channel `push` or `both` on web, a subscription is created; the reminders screen shows a real push status instead of the static note.

- [ ] **Step 1: Add i18n keys to all three locales (inside the existing `reminders` object)**

`app/src/locales/cs.json`:
```json
"pushEnabled": "Push je na tomto zařízení zapnutý.",
"pushBlocked": "Notifikace jsou v prohlížeči zablokované. Povol je v nastavení webu.",
"pushUnsupported": "Tento prohlížeč push nepodporuje. Na iPhonu appku nejdřív přidej na plochu.",
"pushEnabling": "Zapínám push…"
```

`app/src/locales/en.json`:
```json
"pushEnabled": "Push is enabled on this device.",
"pushBlocked": "Notifications are blocked in your browser. Enable them in site settings.",
"pushUnsupported": "This browser doesn't support push. On iPhone, add the app to your home screen first.",
"pushEnabling": "Enabling push…"
```

`app/src/locales/sk.json`:
```json
"pushEnabled": "Push je na tomto zariadení zapnutý.",
"pushBlocked": "Notifikácie sú v prehliadači zablokované. Povoľ ich v nastavení webu.",
"pushUnsupported": "Tento prehliadač push nepodporuje. Na iPhone appku najprv pridaj na plochu.",
"pushEnabling": "Zapínam push…"
```

(Place them next to the existing `channelEmail`/`channelPush`/`channelBoth`/`pushNote` keys. Keep valid JSON — add a comma after the preceding entry.)

- [ ] **Step 2: Import push helpers in `reminders.tsx`**

Add to the imports:
```ts
import { pushSupported, getPushStatus, subscribeWebPush, type PushStatus } from '@/lib/push';
```

- [ ] **Step 3: Add push status state and load it**

Inside the component, add state and a loader (near the other state/hooks):
```ts
const [pushStatus, setPushStatus] = useState<PushStatus>('unsupported');

useEffect(() => {
  getPushStatus().then(setPushStatus).catch(() => setPushStatus('unsupported'));
}, []);
```
(Add `useEffect` to the existing `react` import if it isn't already imported.)

- [ ] **Step 4: In the channel-change handler, subscribe when push/both is chosen**

Find `changeChannel` (the function called by the channel chips) and make it request the subscription when the new channel includes push. Replace its body with:
```ts
async function changeChannel(next: ReminderChannel) {
  if (!session) return;
  // Uloží kanál (stejně jako dosud).
  await setReminderPrefs(session.user.id, prefs?.email ?? session.user.email ?? null, enabled, next);
  setPrefs((p) => (p ? { ...p, channel: next } : p));
  // Když kanál zahrnuje push, vyžádej povolení a vytvoř odběr.
  if ((next === 'push' || next === 'both') && pushSupported()) {
    setPushStatus('default');
    const ok = await subscribeWebPush(session.user.id);
    setPushStatus(ok ? 'subscribed' : (Notification.permission === 'denied' ? 'denied' : 'default'));
  }
}
```
(Adjust the `setReminderPrefs` arguments to match the existing signature `setReminderPrefs(userId, email, enabled, channel)` and the local variable names already in the file — read the current `changeChannel` first and keep its existing persistence call; only add the push subscribe block.)

- [ ] **Step 5: Replace the static push note with the real status**

Find where `t('reminders.pushNote')` is rendered (shown when channel is `push`/`both`). Replace that note with a status-driven message:
```tsx
{(prefs?.channel === 'push' || prefs?.channel === 'both') && (
  <Text style={s.note}>
    {pushStatus === 'subscribed'
      ? t('reminders.pushEnabled')
      : pushStatus === 'denied'
        ? t('reminders.pushBlocked')
        : !pushSupported()
          ? t('reminders.pushUnsupported')
          : t('reminders.pushEnabling')}
  </Text>
)}
```
(Reuse the existing note style; if the current note uses a different style name, keep that name.)

- [ ] **Step 6: Lint, typecheck, export**

Run: `cd .. && node scripts/lint-styles.mjs && cd app && npx tsc --noEmit && npx expo export --platform web`
Expected: lint OK, no TS errors, `Exported: dist`.

- [ ] **Step 7: Commit**

```bash
git add app/src/app/reminders.tsx app/src/locales/cs.json app/src/locales/en.json app/src/locales/sk.json
git commit -m "Reminders: subscribe to web push when channel includes push"
```

---

### Task 5: Send web push from `send-reminders`

**Files:**
- Modify: `supabase/functions/send-reminders/index.ts`

**Interfaces:**
- Consumes: table `push_subscriptions` (Task 1); env `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- Produces: for users whose `channel` is `push` or `both`, each due slot is delivered as a web push to all their subscriptions, sharing the existing `reminder_sends` idempotency and `MAX_DAILY` cap.

- [ ] **Step 1: Import and configure `web-push` (top of the file, after existing imports)**

```ts
import webpush from 'npm:web-push@3';

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@leafello.app';
const pushEnabled = VAPID_PUBLIC !== '' && VAPID_PRIVATE !== '';
if (pushEnabled) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
```

- [ ] **Step 2: Replace the per-user guard and `deliver` closure to handle push**

Replace the block from `if (!p.email) continue;` / `if (p.channel === 'push') continue;` (lines ~83-85) and the `deliver` closure (lines ~104-121) with:

```ts
    const wantEmail = (p.channel === 'email' || p.channel === 'both') && !!p.email;
    const wantPush = (p.channel === 'push' || p.channel === 'both') && pushEnabled;

    // Odběry web push (jen když je chceme).
    const subs = wantPush
      ? ((await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', p.user_id)).data ?? [])
      : [];

    // Nic k doručení → přeskoč uživatele.
    if (!wantEmail && subs.length === 0) continue;

    const goalRes = await admin
      .from('goals')
      .select('water_ml')
      .eq('user_id', p.user_id)
      .eq('is_active', true)
      .maybeSingle();
    const waterMl = goalRes.data?.water_ml ?? 2000;
    const tm = { ...DEFAULT_TIMES, ...((p.times as Record<string, unknown>) ?? {}) };

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
      // Bez e-mailového providera a bez push odběrů není jak doručit.
      if (!wantEmail && subs.length === 0) return;
      // Bez providera pro e-mail-only jen ohlásíme (jako dosud).
      if (wantEmail && !resendKey && subs.length === 0) {
        planned.push(`${p.email}:${slot}`);
        return;
      }
      if (budget <= 0) return;
      // Idempotence: jeden zápis na (user, slot, den) napříč kanály.
      const ins = await admin.from('reminder_sends').insert({ user_id: p.user_id, slot, sent_on: date }).select('slot');
      if (ins.error) return; // už odesláno dnes
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
```

(The slot-computation code below `deliver` — weigh-in, water, meals — stays exactly as-is; it calls `deliver(slot, subject, body)` and now fans out to email and/or push.)

- [ ] **Step 3: Deno check (if available) / visual review**

Run (best-effort): `npx supabase functions deploy send-reminders --project-ref finmrsqojucsotpbbaaf --no-verify-jwt` is done in Task 6; here just re-read the diff to confirm the slot loop is untouched and `deliver` compiles logically.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-reminders/index.ts
git commit -m "send-reminders: deliver reminders via web push for push/both channels"
```

---

### Task 6: Deploy, secrets, and scheduler (manual checklist)

**Files:** none (ops). This task has no automated test; it wires the running system.

- [ ] **Step 1: Generate a VAPID key pair**

Run: `npx web-push generate-vapid-keys`
Record the `Public Key` and `Private Key`.

- [ ] **Step 2: Set Supabase secrets**

```bash
npx supabase secrets set VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:jan.harak@tesena.com --project-ref finmrsqojucsotpbbaaf
```

- [ ] **Step 3: Set the Vercel env var for the web build**

In Vercel project settings add `EXPO_PUBLIC_VAPID_PUBLIC_KEY=<public>` (Production + Preview) and redeploy the web app so the client picks it up.

- [ ] **Step 4: Apply migration and deploy the edge function**

```bash
node scripts/db-push.mjs
npx supabase functions deploy send-reminders --project-ref finmrsqojucsotpbbaaf --no-verify-jwt
```

- [ ] **Step 5: Verify / set up the scheduler**

`send-reminders` must run every ~10–15 min. Check whether email reminders already fire (pg_cron in the Supabase dashboard → Database → Cron, or Extensions `pg_cron`/`pg_net`).
- If a job already calls `send-reminders`: nothing to do — push rides along.
- If not: add a schedule. Preferred pg_cron (precise). Example (run in the SQL editor; keep the secret out of git):
  ```sql
  select cron.schedule(
    'send-reminders',
    '*/10 * * * *',
    $$ select net.http_post(
         url := 'https://finmrsqojucsotpbbaaf.functions.supabase.co/send-reminders',
         headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
         body := '{}'::jsonb
       ); $$
  );
  ```
  Fallback (version-controlled but less punctual): a `.github/workflows/reminders.yml` at `*/10 * * * *` POSTing to `/functions/v1/send-reminders` with header `x-cron-secret` (modeled on `weekly-coach.yml`). The user must add this file (workflow scope).

- [ ] **Step 6: Manual end-to-end check**

On the deployed PWA: open Reminders, choose channel `push` (or `both`), allow notifications (status shows “Push je na tomto zařízení zapnutý”). Temporarily set a meal time to the current time, then trigger the function within the window:
```bash
curl -X POST 'https://finmrsqojucsotpbbaaf.functions.supabase.co/send-reminders' -H 'x-cron-secret: <CRON_SECRET>'
```
Expected: a notification appears; clicking it focuses/opens the app. Confirm a second immediate trigger does NOT resend the same slot (idempotency).

---

### Task 7 (optional): "Send a test notification" button

Only implement if the user wants an in-app verification shortcut. It sends one push to the current user's own subscriptions via a tiny edge function.

**Files:**
- Create: `supabase/functions/push-test/index.ts`
- Modify: `app/src/app/reminders.tsx` (a button shown when `pushStatus === 'subscribed'`)
- Modify: `app/src/lib/db.ts` (`sendTestPush(): Promise<void>` invoking the function)
- i18n: `reminders.pushTest` in all three locales.

**Interfaces:**
- Produces: `sendTestPush(): Promise<void>`; edge function `push-test` that authenticates the user (JWT), loads their `push_subscriptions`, and sends one `{ title, body, url:'/' }` push each (same 410/404 cleanup as Task 5).

- [ ] **Step 1: Create `supabase/functions/push-test/index.ts`**

```ts
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
```

- [ ] **Step 2: Add `sendTestPush` to `db.ts`**

```ts
/** Pošle testovací push na vlastní odběry (ověření). */
export async function sendTestPush(): Promise<void> {
  const { error } = await supabase.functions.invoke('push-test', { body: {} });
  if (error) throw error;
}
```

- [ ] **Step 3: Add the button in `reminders.tsx`** (shown only when `pushStatus === 'subscribed'`), i18n key `reminders.pushTest` (cs "Poslat testovací notifikaci" / en "Send a test notification" / sk "Poslať testovaciu notifikáciu"), calling `sendTestPush()`.

- [ ] **Step 4: Lint, typecheck, export**

Run: `node scripts/lint-styles.mjs && cd app && npx tsc --noEmit && npx expo export --platform web`

- [ ] **Step 5: Deploy and commit**

```bash
npx supabase functions deploy push-test --project-ref finmrsqojucsotpbbaaf
git add supabase/functions/push-test/index.ts app/src/lib/db.ts app/src/app/reminders.tsx app/src/locales/*.json
git commit -m "Reminders: send-test-notification button + push-test edge function"
```

---

## Self-Review Notes

- **Spec coverage:** table (T1), SW handlers (T2), VAPID/env (T6), client subscribe wired to selector (T3+T4), send-reminders push branch with 410/404 cleanup and shared idempotency (T5), scheduler verification (T6), optional test button (T7 — the spec's optional item). All spec sections map to a task.
- **Idempotency for `both`:** the single `reminder_sends` insert in `deliver` gates both email and push, so a slot is marked once/day across channels (matches spec).
- **Push-only users:** the old `if (!p.email) continue;` is removed; a user is skipped only when they have neither email delivery nor any push subscription.
- **Types:** `PushSubscriptionInput`, `upsertPushSubscription`, `deletePushSubscriptionByEndpoint`, `pushSupported`, `getPushStatus`, `subscribeWebPush`, `unsubscribeWebPush`, `PushStatus` are consistent between definition (T3) and use (T4).
