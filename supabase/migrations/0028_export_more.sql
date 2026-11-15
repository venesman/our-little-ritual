-- =====================================================================
-- Our Little Ritual — Export our story: count the newer things too (15 Nov 2026)
--
-- Same month-by-month counts as before, plus Quiz Duels and "How well do you
-- know me?" games played, things made together in Creative Corner, and songs
-- shared (Our Soundtrack + songs in opened letters). Counts only — no content.
-- (A new name, so the app keeps working until this is run.)
-- =====================================================================

create or replace function public.export_activity_summary_v2(p_from date, p_to date)
returns table (month date, rituals_both int, checkins_both int, letters int, play_sessions int, curious_sessions int, apart_missions int,
               games int, creations int, songs int)
language sql stable security definer set search_path = '' as $$
  with rel as (select public.my_relationship_id() id)
  select s.month, s.rituals_both, s.checkins_both, s.letters, s.play_sessions, s.curious_sessions, s.apart_missions,
    (select count(*)::int from public.quiz_matches q where q.relationship_id = (select id from rel) and q.status = 'finished'
       and date_trunc('month', q.finished_at)::date = s.month)
    + (select count(*)::int from public.knowme_games k where k.relationship_id = (select id from rel) and k.status = 'finished'
       and date_trunc('month', k.finished_at)::date = s.month),
    (select count(*)::int from public.creations c where c.relationship_id = (select id from rel) and c.status = 'finished'
       and date_trunc('month', c.finished_at)::date = s.month),
    (select count(*)::int from public.soundtrack_entries t where t.relationship_id = (select id from rel)
       and date_trunc('month', t.shared_on)::date = s.month)
    + (select count(*)::int from public.letters l where l.relationship_id = (select id from rel) and l.song_url is not null and l.opened_at is not null
       and date_trunc('month', coalesce(l.reveal_at, l.sent_at))::date = s.month)
  from public.export_activity_summary(p_from, p_to) s;
$$;
revoke execute on function public.export_activity_summary_v2(date, date) from public, anon;
grant execute on function public.export_activity_summary_v2(date, date) to authenticated;
