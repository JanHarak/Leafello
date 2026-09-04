# @dietapp/analyze-photo

Rozhodovací logika Edge Function `analyze-photo` (F-10). **Stav: hotovo**
(fáze 4), testy T-48 až T-56 procházejí.

Logika je bez závislosti na Deno, síti a databázi – volání Gemini, ukládání
a spánek se injektují, takže je plně testovatelná s mockem a stejný kód
používá i Deno handler v `supabase/functions/analyze-photo/index.ts`.

Pokrývá: parsování odpovědi (i ```json fence), filtrování položek s nulovou
gramáží, denní rate limit, autorizaci cesty ve Storage, JWT, jeden retry na
Gemini 429. **Fotoanalýza se nikdy neukládá do deníku automaticky.**

Spuštění testů: `npm test --workspace @dietapp/analyze-photo`. Samotný Deno
handler se ověřuje až po nasazení (`supabase functions deploy analyze-photo`).
