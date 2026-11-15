-- Our Little Ritual — one-time import of Open Trivia DB questions into Quiz Time.
-- Optional. Run ONCE in Supabase → SQL Editor, after migration 0020_quiz_duel.sql.
-- Needs the pg_cron and pg_net extensions (already on if gentle reminders work).
-- It fetches 50 questions every 15 seconds and switches itself off when done
-- (roughly half an hour). Check progress with:
--   select phase, imported, requests, updated_at from public.quiz_import_state;
-- Questions from Open Trivia DB (https://opentdb.com), licensed CC BY-SA 4.0.

select cron.unschedule('olr-quiz-import') where exists (select 1 from cron.job where jobname = 'olr-quiz-import');
select cron.schedule('olr-quiz-import', '15 seconds', 'select public.opentdb_import_step()');
