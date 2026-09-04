# supabase

**Stav:** placeholder. Zatím bez migrací a funkcí.

Podle `docs/zadani.md`, sekce 4 a 5:

- `migrations/` – číslované SQL migrace. Existující migrace se nikdy
  nemění, přidává se vždy nový soubor. **Žádná tabulka bez RLS** (sekce
  4.1), test T-47 čte metadata Postgresu a selže při tabulce bez RLS.
- `functions/` – Edge Functions (Deno): `analyze-photo`, `generate-recipe`,
  `weekly-summary`, `delete-account`. Klíč Gemini pouze v Supabase secrets,
  nikdy v klientovi ani v repozitáři (N-08).
- `tests/` – RLS a constraint testy proti čisté databázi (T-41 až T-47).

Fáze 1 a dále.
