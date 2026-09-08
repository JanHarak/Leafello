# Podklady pro Lottie – animovaný maskot

Zadání pro tvorbu animací postavičky (avatara) v Lottie, plus startovací
soubor a plán integrace. Cílem je nahradit statické SVG avatary živým
maskotem řízeným náladou.

## Kde se maskot používá
- **Úvodní obrazovka (dashboard)** – hlavní, velký (~288 px), mezi kruhy jídlo/pití.
- Nálada se počítá v balíčku `@dietapp/gamification-rules` (`moodFor`) a nabývá
  hodnot: `happy`, `hungry`, `thirsty`, `sleepy`, `celebrating`.

## Požadované animace (stavy)
| Klíč | Typ | Popis | Smyčka |
|---|---|---|---|
| `happy` | idle | mrkání + opakující se rozšíření úsměvu + jemné „dýchání" | ano |
| `hungry` | idle | neutrálnější výraz, občasné mrknutí, drobný pohyb | ano |
| `thirsty` | idle | jako happy + kapka/žíznivý detail | ano |
| `sleepy` | idle | přivřené oči, pomalé „dýchání", případně „Z" | ano |
| `celebrating` | idle/one‑shot | poskok + jiskřičky, široký úsměv | smyčka i jednorázově |
| `tap` (otřepání) | one‑shot | veselé zakývání ze strany na stranu po kliknutí | ne |

Pozn.: `tap` může být samostatný soubor, nebo segment (marker) uvnitř každého
idle stavu, který se přehraje jednorázově na dotek a vrátí do idle.

## Technické parametry (export)
- **Rozměr:** čtverec, návrh 512×512 px (renderuje se menší, ať je ostrý).
- **FPS:** 30. **Pozadí:** průhledné.
- **Délka idle smyček:** cca 2–3 s, plynulé napojení (první = poslední snímek).
- **Formát:** Lottie JSON (Bodymovin) nebo `.lottie` (dotLottie). Bez rastrů,
  bez fontů, vektory ponechat jako shapes (kvůli případnému přebarvení).
- **Pojmenování:** `avatar-happy.json`, `avatar-hungry.json`, … a `avatar-tap.json`
  (nebo markery `idle`, `tap` v jednom souboru).
- **Umístění v repu:** `assets/lottie/`.

## Barvy (z designového systému)
Navrhni ve **světlé** paletě; pro tmavý režim buď dodej variantu, nebo použij
světlejší odstíny (viz `app/src/theme.ts`).

| Role | Světlá | Tmavá |
|---|---|---|
| tělo (accent) | `#2f7dd1` | `#5aa0e6` |
| oči/ústa (na těle) | `#ffffff` | `#11161b` |
| tváře (růžová) | `#b6699a` | `#d68cbb` |
| jiskřičky (oslava) | `#d99a2b` | `#e7b451` |
| kapka (žízeň) | `#1798a5` | `#3fc0d6` |

## Zdrojová grafika (odkud vyjít)
- Aktuální statické avatary: `app/assets/avatar/happy.svg`, `hungry.svg`,
  `thirsty.svg`, `sleepy.svg`, `celebrating.svg` – lze importovat do After
  Effects / LottieFiles jako výchozí tvar postavičky.
- Ukázka pohybu konceptu: `docs/avatar-happy-animated.svg` (SMIL – otevři v prohlížeči).
- **Startovací Lottie:** `assets/lottie/avatar-happy.json` – funkční základ
  (dýchání + mrkání + rozšiřující se úsměv). Otevři v <https://lottiefiles.com/preview>
  nebo LottieFiles appce a iteruj z něj. Je to jednoduchý základ, ne finální art.

## Deliverables (co dodat)
1. `avatar-<nálada>.json` pro všech 5 nálad (idle smyčky).
2. `avatar-tap.json` (nebo `tap` marker) – otřepání.
3. Volitelně tmavé varianty, jinak dodáme přebarvení za běhu.
4. Náhledy (GIF/MP4) ke schválení.

## Plán integrace (udělám po dodání souborů)
Balíčky: `lottie-react-native` (iOS/Android) a `lottie-react` (web) – nebo
`@lottiefiles/dotlottie-react`, který umí obojí z jednoho `.lottie`.

Náčrt použití (nahradí dnešní `AnimatedAvatar`):
```tsx
import LottieView from 'lottie-react-native';
const SRC = {
  happy: require('@/assets/lottie/avatar-happy.json'),
  hungry: require('@/assets/lottie/avatar-hungry.json'),
  // …
};
<LottieView source={SRC[mood]} autoPlay loop style={{ width: size, height: size }} />
// tap: ref.play(tapStart, tapEnd) na onPress, po dohrání zpět do idle
```

Poznámky:
- Instalace přes `npx expo install lottie-react-native` (kompatibilní verze).
- Přebarvení pro light/dark lze řešit buď dvěma sadami souborů, nebo
  runtime úpravou barev (colorFilters) – doporučuji raději dvě varianty.
- Interakce (otřepání na dotek) navážeme na `ref` přehrávače.

Jakmile budou finální `.json`/`.lottie` v `assets/lottie/`, napojím je do
aplikace a nastavím mapování nálad + otřepání na dotek.
