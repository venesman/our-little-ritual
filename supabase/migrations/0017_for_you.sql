-- =====================================================================
-- Our Little Ritual — "For you" (polish, approved by Vee, 15 Nov 2026)
--
-- One small summary of what's waiting for you right now. It powers the
-- "For you" line and the Welcome back card on Home, and the quiet dots on the
-- bottom bar. Counts and yes/no only — never content — and nothing here that
-- the app didn't already show (e.g. "your partner has shared").
-- =====================================================================

create or replace function public.for_you()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() uid, public.my_relationship_id() rel, public.ritual_week_start(now()) wk),
  this_week as (select w.id from public.weekly_activities w, me where w.relationship_id = me.rel and w.week_start = me.wk)
  select case when (select rel from me) is null then '{}'::jsonb else jsonb_build_object(
    -- this week's ritual: partner has shared, you haven't
    'ritual_partner_shared', exists (
       select 1 from public.activity_submissions s, me
        where s.weekly_activity_id = (select id from this_week) and s.user_id <> me.uid and s.status = 'submitted')
       and not exists (
       select 1 from public.activity_submissions s, me
        where s.weekly_activity_id = (select id from this_week) and s.user_id = me.uid and s.status = 'submitted'),
    -- you haven't shared this week's ritual yet (whether or not it's been opened)
    'ritual_open', not exists (
       select 1 from public.activity_submissions s, me
        where s.weekly_activity_id = (select id from this_week) and s.user_id = me.uid and s.status = 'submitted'),
    -- earlier weeks your partner shared that you haven't (for "Welcome back")
    'older_rituals_waiting', (
       select count(*)::int from public.weekly_activities w, me
        where w.relationship_id = me.rel and w.week_start < me.wk
          and exists (select 1 from public.activity_submissions s where s.weekly_activity_id = w.id and s.user_id <> me.uid and s.status = 'submitted')
          and not exists (select 1 from public.activity_submissions s where s.weekly_activity_id = w.id and s.user_id = me.uid and s.status = 'submitted')),
    -- this week's check-in: partner has shared, you haven't
    'checkin_partner_shared', exists (
       select 1 from public.checkins c, me where c.relationship_id = me.rel and c.week_start = me.wk and c.user_id <> me.uid and c.status = 'submitted')
       and not exists (
       select 1 from public.checkins c, me where c.relationship_id = me.rel and c.week_start = me.wk and c.user_id = me.uid and c.status = 'submitted'),
    'letters_unread', (
       select count(*)::int from public.letters l, me
        where l.recipient_id = me.uid and l.status = 'sent' and (l.reveal_at is null or l.reveal_at <= now()) and l.opened_at is null),
    -- Apart missions where it's your turn: your partner has shared and you haven't (or, in a relay, they went last)
    'apart_my_turn', (
       select count(*)::int from public.apart_missions m join public.play_activities a on a.id = m.activity_id, me
        where m.relationship_id = me.rel and m.closed_at is null
          and case when a.style = 'relay'
                   then (select e.user_id from public.apart_entries e where e.mission_id = m.id order by e.created_at desc limit 1) <> me.uid
                   else exists (select 1 from public.apart_entries e where e.mission_id = m.id and e.user_id <> me.uid)
                        and not exists (select 1 from public.apart_entries e where e.mission_id = m.id and e.user_id = me.uid) end),
    -- when something last arrived in the scrapbook (for the quiet dot on Us)
    'latest_memory_at', (
       select max(t) from (
         select max(e.updated_at) t from public.scrapbook_entries e, me where e.relationship_id = me.rel and e.saved
         union all select max(x.created_at) from public.moments x, me where x.relationship_id = me.rel
         union all select max(p.created_at) from public.moment_photos p, me where p.relationship_id = me.rel
         union all select max(d.created_at) from public.curious_discoveries d, me where d.relationship_id = me.rel
         union all select max(x.created_at) from public.milestones x, me where x.relationship_id = me.rel
       ) q)
  ) end;
$$;

revoke execute on function public.for_you() from public, anon;
grant execute on function public.for_you() to authenticated;
