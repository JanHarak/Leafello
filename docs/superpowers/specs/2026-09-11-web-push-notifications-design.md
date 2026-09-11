# Web push notifikace pro připomínky – návrh

Datum: 2026-09-11
Stav: schváleno k implementaci

## Cíl

Doručovat existující připomínky (pití, jídla, vážení) i jako **web push**
notifikace do prohlížeče / nainstalované PWA, nejen e-mailem. Kanál
(`email` / `push` / `both`) už existuje v datech i v UI; chybí jen doručovací
cesta pro `push`.

Nativní připomínky zůstávají na **lokálních notifikacích** naplánovaných v
telefonu (`expo-notifications`, denní triggery v `reminders.tsx`) – bez serveru.
Serverový Expo push se neřeší (žádný nativní build zatím neexistuje).

## Mimo scope (YAGNI)

- Push pro týdenní přehled kouče.
- Serverový Expo push pro nativ (APNs/FCM, EAS build).
- Offline caching v service workeru.

## Současný stav (co už existuje)

- Tabulka `reminder_prefs(user_id, email, email_reminders, channel, times)`;
  `channel text check in ('email','push','both')` (migrace 0006, 0007, 0009).
- Edge funkce `send-reminders` (Deno): počítá sloty (pití dle `waterSchedule`,
  snídaně/oběd/večeře, vážení po 7 dnech), TZ `Europe/Prague`, `WINDOW_MIN = 15`,
  denní strop `MAX_DAILY = 8`, idempotence přes `reminder_sends(user_id, slot,
  sent_on)`. Autorizace hlavičkou `x-cron-secret` (env `CRON_SECRET`),
  nasazeno `--no-verify-jwt`. **Řádky s `channel === 'push'` teď přeskakuje**
  (`continue`), e-mail posílá přes Resend pro `email` a `both`.
- `reminders.tsx`: přepínač kanálu email/push/both (web), editor časů, na nativu
  lokální notifikace. Přepínač push dnes ukazuje jen statickou poznámku.
- Service worker `app/public/sw.js`: zaregistrovaný v `_layout.tsx`, ale prázdný
  (install/activate/fetch), **žádný `push` handler**.
- PWA manifest `app/public/manifest.webmanifest`.
- Žádná tabulka odběrů, žádné VAPID, žádný web-push kód.

## Architektura

Rozšířit existující motor, ne stavět nový. Web push = přidat kanál do
`send-reminders` a doplnit klientský odběr + úložiště.

### 1. Úložiště odběrů (migrace `0020_push_subscriptions.sql`)

```sql
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

- Jeden řádek na prohlížeč/zařízení; `endpoint` unikátní (re-subscribe přepíše
  přes upsert on conflict endpoint).
- Odesílač (service-role) čte napříč uživateli; RLS pouští jen vlastní řádky
  uživateli v klientovi.

### 2. VAPID klíče

- Vygenerovat pár (`npx web-push generate-vapid-keys`).
- Veřejný klíč → web build jako `EXPO_PUBLIC_VAPID_PUBLIC_KEY` (Vercel env,
  `EXPO_PUBLIC_` prefix ho zpřístupní v klientovi).
- Privátní + veřejný + subject → Supabase secrets: `VAPID_PRIVATE_KEY`,
  `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` (`mailto:...`).

### 3. Service worker (`app/public/sw.js`)

Přidat dva handlery (zbytek beze změny):

- `push`: `event.data.json()` → `{ title, body, url }` →
  `self.registration.showNotification(title, { body, data: { url }, icon, badge })`.
- `notificationclick`: zavřít notifikaci, zaostřit existující okno appky nebo
  otevřít `data.url` / `/`.

### 4. Klient (`app/src/lib/push.ts`, web-only)

- `pushSupported(): boolean` – feature-detekce (`'serviceWorker' in navigator`,
  `'PushManager' in window`, `'Notification' in window`). Na iOS je push jen v
  nainstalované PWA (16.4+), jinak API chybí → vrátí false.
- `getPushStatus(): 'unsupported' | 'denied' | 'subscribed' | 'default'`.
- `subscribeWebPush(userId): Promise<boolean>` – `Notification.requestPermission()`
  → z registrace SW `pushManager.subscribe({ userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(EXPO_PUBLIC_VAPID_PUBLIC_KEY) })`
  → z `subscription.toJSON()` vytáhnout `endpoint`, `keys.p256dh`, `keys.auth`
  → upsert do `push_subscriptions` (on conflict endpoint). Vrací true při úspěchu.
- `unsubscribeWebPush(): Promise<void>` – `getSubscription()` → `unsubscribe()` →
  smazat řádek podle endpointu.
- Pomocná `urlBase64ToUint8Array`.

SW registrace v `_layout.tsx` je dnes fire-and-forget; `lib/push.ts` si vezme
registraci přes `navigator.serviceWorker.ready`.

### 5. Napojení UI (`app/src/app/reminders.tsx`)

- Při volbě kanálu `push` nebo `both` (web): zavolat `subscribeWebPush`. Když
  uživatel povolení odmítne / je blokované, ukázat reálný stav místo statické
  `pushNote` (nové i18n: „Notifikace jsou v prohlížeči zablokované", „Push zapnutý
  na tomto zařízení", „Tento prohlížeč push nepodporuje").
- Při přepnutí zpět na `email` odběr necháme být (neškodí); explicitní odhlášení
  neřešíme v této fázi.
- Feature-detekce: když `!pushSupported()`, volby push/both zobrazit jako
  nedostupné s vysvětlením (např. iOS bez instalace na plochu).

### 6. Odeslání (`supabase/functions/send-reminders/index.ts`)

- Import `npm:web-push@3`; nastavit VAPID z env.
- Kde je dnes `if (channel === 'push') continue;`: pro `push` i `both` po zjištění
  zralého slotu poslat web push na **všechny** `push_subscriptions` uživatele
  (payload `{ title, body, url: '/' }`; texty per slot – reuse stávajících textů
  slotů, jen jako notifikace místo e-mailu).
- Idempotence beze změny: slot se do `reminder_sends` zapíše jednou za den napříč
  kanály (u `both` jde e-mail i push, ale mark je jeden). Denní strop `MAX_DAILY`
  platí dál.
- Chyba doručení `410 Gone` / `404` (expirovaný odběr) → smazat řádek
  `push_subscriptions`. Ostatní chyby jen zalogovat, neshodit běh.
- E-mail větev (`email` / `both`) zůstává beze změny.

### 7. Scheduler (ověřit / doplnit)

`send-reminders` musí běžet ~každých 10–15 min, jinak sloty (a tím push)
nedorazí včas (`WINDOW_MIN = 15`).

- **Ověřit**, zda už běží pg_cron (kvůli e-mailovým připomínkám). V repu žádná
  pg_cron migrace není – nastavení je buď ruční v dashboardu, nebo neběží.
- Pokud běží: push jede na stejném scheduleru zadarmo, nic nepřidáváme.
- Pokud neběží: doplnit spouštění. Preferováno **pg_cron + pg_net** (přesné časy),
  jako fallback GitHub workflow `reminders.yml` s `*/10 * * * *` podle vzoru
  `weekly-coach.yml` (POST na `/functions/v1/send-reminders` s `x-cron-secret`),
  s vědomím, že GitHub cron bývá zpožděný.

## Error handling

- Klient: chybějící/blokované povolení nebo nepodporovaný prohlížeč → stav v UI,
  žádný pád; kanál se uloží, ale bez odběru push prostě nedorazí (poznámka to
  vysvětlí).
- Odesílač: neplatný odběr se maže; ostatní chyby se logují a nepřeruší dávku.
- iOS Safari mimo nainstalovanou PWA: API chybí → `pushSupported()` false.

## Testování

- V harnessu nelze reálně doručit push. Automaticky ověřit: `node
  scripts/lint-styles.mjs`, `cd app && npx tsc --noEmit`, `npx expo export
  --platform web`, a `deno check` na edge funkci pokud dostupné.
- Manuálně po nasazení: na nasazené PWA zapnout push (povolit), ručně zavolat
  `send-reminders` (workflow_dispatch / curl s `x-cron-secret`) v okně slotu,
  ověřit doručení a `notificationclick`.
- Volitelně (mimo hlavní scope, ale usnadní ověření): tlačítko „poslat testovací
  notifikaci" na obrazovce Připomínky, které pošle jeden push na vlastní odběry
  přes malou akci (může být samostatný krok plánu, pokud si ho vyžádáš).

## Kroky nasazení

1. Migrace `0020_push_subscriptions.sql` (`node scripts/db-push.mjs`).
2. Vygenerovat VAPID pár.
3. Supabase secrets: `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`.
4. Vercel env: `EXPO_PUBLIC_VAPID_PUBLIC_KEY` (a redeploy web buildu).
5. Redeploy `send-reminders` (`--no-verify-jwt`).
6. Ověřit/nastavit scheduler (pg_cron nebo `reminders.yml`).
