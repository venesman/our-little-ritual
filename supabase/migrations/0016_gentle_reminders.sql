-- =====================================================================
-- Our Little Ritual — Gentle reminders (approved by Vee, 15 Nov 2026)
--
-- Opt-in web push, chosen by each of you on your own phone:
--   * Monday   — "Your Monday postcard has arrived" when the ritual opens
--   * Thursday — one soft nudge at 7 pm your time, only if this week's
--                ritual or check-in is still waiting for you
--   * Letters  — optional (off by default): when a letter reaches you
-- Never more than two a week from Monday/Thursday. Reminders never contain
-- anything private — no names of activities, no letter text.
--
-- The database decides who is due (due_reminders); a small Supabase Edge
-- Function ("send-reminders") delivers them and runs once an hour.
-- =====================================================================

alter table public.profiles
  add column remind_monday   boolean not null default true,
  add column remind_midweek  boolean not null default true,
  add column remind_letters  boolean not null default false;

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  user_agent  text not null default '' check (char_length(user_agent) <= 300),
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- What was sent, so nothing is ever sent twice.
create table public.reminder_log (
  user_id  uuid not null references auth.users (id) on delete cascade,
  kind     text not null check (kind in ('monday', 'midweek', 'letter', 'test')),
  ref      text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, kind, ref)
);

-- ---------------------------------------------------------------- RPCs
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  if public.my_relationship_id() is null then
    raise exception 'Reminders open once you''re in a space.' using errcode = 'P0001';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000
     or coalesce(char_length(p_p256dh), 0) not between 10 and 200 or coalesce(char_length(p_auth), 0) not between 8 and 100 then
    raise exception 'That reminder subscription isn''t valid.' using errcode = '22023';
  end if;
  if (select count(*) from public.push_subscriptions where user_id = auth.uid() and endpoint <> p_endpoint) >= 5 then
    -- keep it tidy: at most five devices each; the oldest goes
    delete from public.push_subscriptions where id = (select id from public.push_subscriptions where user_id = auth.uid() order by created_at limit 1);
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

create or replace function public.my_push_devices()
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.push_subscriptions where user_id = auth.uid();
$$;

create or replace function public.set_reminder_prefs(p_monday boolean, p_midweek boolean, p_letters boolean)
returns void language sql security definer set search_path = '' as $$
  update public.profiles set remind_monday = coalesce(p_monday, remind_monday), remind_midweek = coalesce(p_midweek, remind_midweek),
         remind_letters = coalesce(p_letters, remind_letters)
   where id = auth.uid();
$$;

-- ---------------------------------------------------- who is due right now
-- Called by the sender (service role) once an hour. Returns one row per person
-- and reminder; the sender delivers it to that person's devices and logs it.
create or replace function public.due_reminders(p_now timestamptz default now())
returns table (user_id uuid, kind text, ref text, title text, body text, url text)
language sql stable security definer set search_path = '' as $$
  with people as (
    select p.id, p.timezone, p.remind_monday, p.remind_midweek, p.remind_letters, m.relationship_id rel
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
  -- Letters (optional): one reminder per letter that reached you in the last hour and isn't opened.
  select x.id, 'letter', l.id::text, 'A letter has arrived for you ✉', 'Open it whenever you like.', '/mailbox'
    from people x
    join public.letters l on l.recipient_id = x.id and l.status = 'sent' and l.opened_at is null
   where x.remind_letters
     and coalesce(l.reveal_at, l.sent_at) <= p_now and coalesce(l.reveal_at, l.sent_at) > p_now - interval '1 hour';
$$;

-- -------------------------------------------------------------- RLS
alter table public.push_subscriptions enable row level security;
alter table public.reminder_log enable row level security;
create policy "push subscriptions: own" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
-- reminder_log: no policies — only the sender (service role) reads or writes it.
revoke all on public.push_subscriptions, public.reminder_log from anon, authenticated;
grant select (id, endpoint, created_at, last_ok_at) on public.push_subscriptions to authenticated;

revoke execute on function
  public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text), public.my_push_devices(),
  public.set_reminder_prefs(boolean, boolean, boolean), public.due_reminders(timestamptz)
  from public, anon, authenticated;
grant execute on function
  public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text), public.my_push_devices(),
  public.set_reminder_prefs(boolean, boolean, boolean)
  to authenticated;
-- due_reminders is for the sender only (service role bypasses these grants).
