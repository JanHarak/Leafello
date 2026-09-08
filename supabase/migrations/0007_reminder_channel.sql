-- 0007_reminder_channel.sql
-- Kanál připomínek: e-mail, push, nebo oboje. Push doručení (web/mobil) se
-- doplní později; e-mail funguje přes Edge Function send-reminders.

alter table reminder_prefs
  add column channel text not null default 'email'
  check (channel in ('email', 'push', 'both'));
