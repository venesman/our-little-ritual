-- Our Little Ritual — run the reminder sender every 5 minutes.
-- Run ONCE in Supabase → SQL Editor, after:
--   1. Database → Extensions: turn on "pg_cron" and "pg_net"
--   2. Deploying the "send-reminders" Edge Function and adding its secrets
-- Replace YOUR-PROJECT-REF (from your Project URL) and YOUR-CRON-SECRET (same value as the
-- CRON_SECRET Edge Function secret). This file is a template: never commit real values.

select cron.unschedule('olr-reminders') where exists (select 1 from cron.job where jobname = 'olr-reminders');

select cron.schedule('olr-reminders', '*/5 * * * *', $job$
  select net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-reminders',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "YOUR-CRON-SECRET"}'::jsonb,
    body    := '{}'::jsonb
  );
$job$);
