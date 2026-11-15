-- =====================================================================
-- Our Little Ritual — Timeline (Us → Timeline, 15 Nov 2026)
--
-- Your story on one line, oldest at the bottom: the milestones and important
-- dates you've written in Our Story, your trips and moments, visits (past and
-- coming up), the day your space began, and a few "firsts" the app noticed
-- (first ritual you both shared, first letter, first song, first quiz…).
-- Read-only and built from what's already there; nothing new is collected.
-- =====================================================================

create or replace function public.timeline_feed()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select public.my_relationship_id() rel)
  select coalesce(jsonb_agg(e order by (e->>'on') desc, e->>'kind'), '[]'::jsonb) from (
    -- the day your space began
    select jsonb_build_object('kind', 'began', 'on', (coalesce(r.activated_at, r.created_at))::date, 'title', 'Our Little Ritual began',
             'subtitle', 'You both joined your space') e
      from public.relationships r, me where r.id = me.rel
    union all
    -- Our Story: milestones, important dates, memories (only the ones with a date)
    select jsonb_build_object('kind', m.kind, 'on', m.happened_on, 'title', m.title, 'subtitle', nullif(m.note, ''), 'ref_id', m.id, 'by', m.created_by)
      from public.milestones m, me where m.relationship_id = me.rel and m.happened_on is not null
    union all
    -- trips & moments
    select jsonb_build_object('kind', 'moment', 'on', x.starts_on, 'until', x.ends_on, 'title', x.title, 'subtitle', nullif(x.place, ''), 'ref_id', x.id,
             'photo', (select p.path from public.moment_photos p where p.moment_id = x.id order by p.position limit 1))
      from public.moments x, me where x.relationship_id = me.rel
    union all
    -- visits (including ones coming up)
    select jsonb_build_object('kind', 'visit', 'on', v.starts_on, 'until', v.ends_on, 'title', 'Together in ' || v.place, 'subtitle', nullif(v.note, ''),
             'ref_id', v.id, 'upcoming', v.starts_on > current_date)
      from public.visits v, me where v.relationship_id = me.rel
    union all
    -- firsts the app noticed
    select jsonb_build_object('kind', 'first', 'on', f.on_day, 'title', f.title) from (
      select (select min(w.week_start)::date from public.weekly_activities w where w.relationship_id = me.rel and public.week_revealed(w.id)) on_day,
             'Your first weekly ritual, opened together' title from me
      union all
      select (select min(coalesce(l.reveal_at, l.sent_at))::date from public.letters l where l.relationship_id = me.rel and l.opened_at is not null), 'The first letter in your Mailbox' from me
      union all
      select (select min(s.shared_on) from public.soundtrack_entries s where s.relationship_id = me.rel), 'The first song on Our Soundtrack' from me
      union all
      select (select min(q.finished_at)::date from public.quiz_matches q where q.relationship_id = me.rel and q.status = 'finished'), 'Your first Quiz Duel' from me
      union all
      select (select min(c.finished_at)::date from public.creations c where c.relationship_id = me.rel and c.status = 'finished'), 'The first thing you made in Creative Corner' from me
      union all
      select (select min(k.finished_at)::date from public.knowme_games k where k.relationship_id = me.rel and k.status = 'finished'), 'Your first "How well do you know me?"' from me
    ) f where f.on_day is not null
  ) q;
$$;

revoke execute on function public.timeline_feed() from public, anon;
grant execute on function public.timeline_feed() to authenticated;
