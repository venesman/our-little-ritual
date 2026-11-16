-- =====================================================================
-- Our Little Ritual — Partner news notifications (16 Nov 2026)
--
-- Asked for by Vee: a notification when the other person
--   * shares their part of this week's ritual (and you haven't yet)
--   * opens the ritual up by sharing second (to the one who shared first)
--   * shares their weekly check-in (and you haven't yet)
--   * posts to an apart mission
--   * thinks of you (the heart tap) — at most one an hour
--   * sends a letter that reaches you (letters are now on for everyone)
-- Each person can turn these off in Settings. They never include private
-- content: only your partner's name and what kind of thing happened.
-- Gentle: nothing between 10 pm and 8 am in your own time — anything that
-- happens overnight arrives at 8 am instead (within 12 hours).
-- The existing sender (send-reminders) delivers them; run it every 5 minutes
-- (see supabase/reminders_schedule.sql). No new secrets or functions to deploy.
-- =====================================================================

alter table public.profiles
  add column if not exists remind_partner boolean not null default true,
  add column if not exists remind_love    boolean not null default true;

-- Vee asked for letter notifications for both of you.
update public.profiles set remind_letters = true;
alter table public.profiles alter column remind_letters set default true;

-- New kinds in the delivery log.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.reminder_log'::regclass and contype = 'c' loop
    execute format('alter table public.reminder_log drop constraint %I', c);
  end loop;
end $$;
alter table public.reminder_log add constraint reminder_log_kind_check
  check (kind in ('monday', 'midweek', 'letter', 'test', 'shared', 'opened', 'checkin', 'mission', 'love'));

create or replace function public.set_news_prefs(p_partner boolean, p_love boolean)
returns void language sql security definer set search_path = '' as $$
  update public.profiles set remind_partner = coalesce(p_partner, remind_partner), remind_love = coalesce(p_love, remind_love)
   where id = auth.uid();
$$;

-- ------------------------------------------------------- who is due now
create or replace function public.due_reminders(p_now timestamptz default now())
returns table (user_id uuid, kind text, ref text, title text, body text, url text)
language sql stable security definer set search_path = '' as $$
  with people as (
    select p.id, p.timezone, p.remind_monday, p.remind_midweek, p.remind_letters, p.remind_partner, p.remind_love, m.relationship_id rel,
           -- awake hours in your own time: 8 am to 10 pm
           extract(hour from p_now at time zone p.timezone) between 8 and 21 as awake,
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
  -- Your partner thought of you — one notification per hour at most (the latest hour only, so no flood in the morning).
  select * from (
    select distinct on (x.id)
           x.id, 'love'::text, to_char(n.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24'),
           x.partner_name || ' is thinking of you ♥', 'Tap the heart back whenever you like.'::text, '/'::text
      from people x
      join public.nudges n on n.relationship_id = x.rel and n.sender_id = x.partner_id
     where x.remind_love and x.awake
       and n.created_at <= p_now and n.created_at > p_now - interval '12 hours'
     order by x.id, n.created_at desc
  ) love;
$$;

revoke execute on function public.set_news_prefs(boolean, boolean), public.due_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.set_news_prefs(boolean, boolean) to authenticated;
-- due_reminders stays for the sender only (service role).

-- Check for news every 5 minutes instead of every hour (only if the reminder job is already scheduled).
do $$
declare v_job bigint;
begin
  if to_regclass('cron.job') is not null then
    execute 'select jobid from cron.job where jobname = ''olr-reminders''' into v_job;
    if v_job is not null then
      execute 'select cron.alter_job($1, schedule := ''*/5 * * * *'')' using v_job;
    end if;
  end if;
end $$;
