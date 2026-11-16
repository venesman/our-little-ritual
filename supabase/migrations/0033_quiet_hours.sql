-- =====================================================================
-- Our Little Ritual — Your own quiet hours (16 Nov 2026)
--
-- Asked for by Vee:
--   * No quiet hours by default: notifications arrive the moment they're sent.
--   * Each of you can set your own quiet hours in Settings (in your own time).
--   * "Thinking of you" and letters always come straight through, even during
--     quiet hours. Only the "your turn" news (ritual, check-in, mission) waits
--     until your quiet hours end (within 12 hours).
-- =====================================================================

alter table public.profiles
  add column if not exists quiet_start smallint check (quiet_start between 0 and 23),
  add column if not exists quiet_end   smallint check (quiet_end between 0 and 23);

-- Set both hours, or pass nulls to turn quiet hours off.
create or replace function public.set_quiet_hours(p_start int, p_end int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_start is null or p_end is null then
    update public.profiles set quiet_start = null, quiet_end = null where id = auth.uid();
    return;
  end if;
  if p_start not between 0 and 23 or p_end not between 0 and 23 or p_start = p_end then
    raise exception 'Please pick two different hours.' using errcode = '22023';
  end if;
  update public.profiles set quiet_start = p_start, quiet_end = p_end where id = auth.uid();
end $$;

create or replace function public.due_reminders(p_now timestamptz default now())
returns table (user_id uuid, kind text, ref text, title text, body text, url text)
language sql stable security definer set search_path = '' as $$
  with people as (
    select p.id, p.timezone, p.remind_monday, p.remind_midweek, p.remind_letters, p.remind_partner, p.remind_love, m.relationship_id rel,
           -- outside your own quiet hours (none unless you set them)
           (p.quiet_start is null or p.quiet_end is null or not (
              case when p.quiet_start < p.quiet_end
                   then extract(hour from p_now at time zone p.timezone) >= p.quiet_start
                    and extract(hour from p_now at time zone p.timezone) <  p.quiet_end
                   else extract(hour from p_now at time zone p.timezone) >= p.quiet_start
                     or extract(hour from p_now at time zone p.timezone) <  p.quiet_end end)) as awake,
           (select coalesce(nullif(trim(q.display_name), ''), 'Your partner') from public.relationship_members o join public.profiles q on q.id = o.user_id
             where o.relationship_id = m.relationship_id and o.user_id <> p.id and o.status = 'active' limit 1) as partner_name,
           (select o.user_id from public.relationship_members o
             where o.relationship_id = m.relationship_id and o.user_id <> p.id and o.status = 'active' limit 1) as partner_id
      from public.profiles p
      join public.relationship_members m on m.user_id = p.id and m.status = 'active'
      join public.relationships r on r.id = m.relationship_id and r.status = 'active'
     where exists (select 1 from public.push_subscriptions s where s.user_id = p.id)
  ),
  wk as (select public.ritual_week_start(p_now) w)
  -- Monday: within the first hour after the postcard opens.
  select x.id, 'monday', to_char((select w from wk) at time zone 'UTC', 'YYYY-MM-DD'),
         'Your Monday postcard has arrived ✉', 'A new little ritual is waiting for you both.', '/'
    from people x
   where x.remind_monday and p_now < (select w from wk) + interval '1 hour'
  union all
  -- Thursday: 7 pm in your own time, only if something this week is still waiting for you.
  select x.id, 'midweek', to_char((select w from wk) at time zone 'UTC', 'YYYY-MM-DD'),
         'A little something is waiting ✦', 'No rush — whenever you have a quiet moment this week.', '/'
    from people x
   where x.remind_midweek
     and extract(isodow from p_now at time zone x.timezone) = 4
     and extract(hour from p_now at time zone x.timezone) = 19
     and (
       not exists (select 1 from public.activity_submissions s join public.weekly_activities w on w.id = s.weekly_activity_id
                    where w.relationship_id = x.rel and w.week_start = (select w from wk) and s.user_id = x.id and s.status = 'submitted')
       or not exists (select 1 from public.checkins c where c.relationship_id = x.rel and c.week_start = (select w from wk)
                       and c.user_id = x.id and c.status = 'submitted'))
  union all
  -- Letters: one per letter that reached you in the last hour and isn't opened.
  select x.id, 'letter', l.id::text, 'A letter has arrived for you ✉', 'Open it whenever you like.', '/mailbox'
    from people x
    join public.letters l on l.recipient_id = x.id and l.status = 'sent' and l.opened_at is null
   where x.remind_letters
     and coalesce(l.reveal_at, l.sent_at) <= p_now and coalesce(l.reveal_at, l.sent_at) > p_now - interval '1 hour'
  union all
  -- Your partner shared their part of this week's ritual, and yours is still waiting.
  select x.id, 'shared', s.weekly_activity_id::text,
         x.partner_name || ' shared this week''s ritual ✦', 'Add yours and you''ll both see each other''s.', '/'
    from people x
    join public.activity_submissions s on s.relationship_id = x.rel and s.user_id = x.partner_id and s.status = 'submitted'
   where x.remind_partner and x.awake
     and s.submitted_at <= p_now and s.submitted_at > p_now - interval '12 hours'
     and not exists (select 1 from public.activity_submissions mine where mine.weekly_activity_id = s.weekly_activity_id
                      and mine.user_id = x.id and mine.status = 'submitted')
  union all
  -- Your partner shared second, so the ritual is open — tell the one who shared first.
  select x.id, 'opened', mine.weekly_activity_id::text,
         'You''ve both shared — it''s open ✉', x.partner_name || ' added theirs. Come and see.', '/'
    from people x
    join public.activity_submissions mine on mine.relationship_id = x.rel and mine.user_id = x.id and mine.status = 'submitted'
    join public.activity_submissions theirs on theirs.weekly_activity_id = mine.weekly_activity_id and theirs.user_id = x.partner_id
                                           and theirs.status = 'submitted' and theirs.submitted_at > mine.submitted_at
   where x.remind_partner and x.awake
     and theirs.submitted_at <= p_now and theirs.submitted_at > p_now - interval '12 hours'
  union all
  -- Your partner did their check-in this week, and yours is still waiting.
  select x.id, 'checkin', c.id::text,
         x.partner_name || ' did this week''s check-in ✦', 'Yours opens theirs.', '/'
    from people x
    join public.checkins c on c.relationship_id = x.rel and c.user_id = x.partner_id and c.status = 'submitted'
   where x.remind_partner and x.awake
     and c.submitted_at <= p_now and c.submitted_at > p_now - interval '12 hours'
     and not exists (select 1 from public.checkins mine where mine.relationship_id = x.rel and mine.week_start = c.week_start
                      and mine.user_id = x.id and mine.status = 'submitted')
  union all
  -- Your partner posted to an apart mission.
  select x.id, 'mission', e.id::text,
         x.partner_name || ' added to your mission ✦', 'Your turn whenever you''re ready.', '/play?mode=apart'
    from people x
    join public.apart_entries e on e.relationship_id = x.rel and e.user_id = x.partner_id
    join public.apart_missions a on a.id = e.mission_id and a.closed_at is null
   where x.remind_partner and x.awake
     and e.created_at <= p_now and e.created_at > p_now - interval '12 hours'
  union all
  -- Your partner thought of you — straight away, any hour; at most one per hour.
  select * from (
    select distinct on (x.id)
           x.id, 'love'::text, to_char(n.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24'),
           x.partner_name || ' is thinking of you ♥', 'Tap the heart back whenever you like.'::text, '/'::text
      from people x
      join public.nudges n on n.relationship_id = x.rel and n.sender_id = x.partner_id
     where x.remind_love
       and n.created_at <= p_now and n.created_at > p_now - interval '12 hours'
     order by x.id, n.created_at desc
  ) love;
$$;

revoke execute on function public.set_quiet_hours(int, int), public.due_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.set_quiet_hours(int, int) to authenticated;
-- due_reminders stays for the sender only (service role).
