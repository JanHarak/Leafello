-- 0009_reminder_times.sql
-- Vlastní časy připomínek. Uloženo jako jsonb; null = výchozí časy.
-- Tvar: { "waterStart": 8, "waterEnd": 20, "breakfast": "08:00",
--         "lunch": "12:30", "dinner": "18:30", "weigh": "08:00" }

alter table reminder_prefs add column times jsonb;
