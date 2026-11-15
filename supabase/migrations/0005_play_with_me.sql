-- =====================================================================
-- Our Little Ritual — Phase 5: Play With Me
-- play_activities (90, seeded) · play_sessions · play_session_items ·
-- play_favourites
--
-- Real-time, during a video call (the app doesn't host the call):
--   * One open session per couple. Whoever opens Play first starts it; the
--     other phone joins the same one.
--   * Draws happen in the database, so both phones always show the same
--     activity. No repeats within a round; when everything matching has
--     been played, a new round starts (reshuffle).
--   * The timer is stored as server timestamps (ends_at / remaining), so
--     both phones count down the same clock, and either can control it.
--   * Favourites: "mine" (only you see it) and "ours" (Our Favourite
--     Things to Do, shared).
-- =====================================================================

create table public.play_activities (
  id             uuid primary key default gen_random_uuid(),
  code           smallint not null unique check (code > 0),
  title          text not null check (char_length(title) between 1 and 80),
  category       text not null check (category in (
                   'guess_discover', 'creative_chaos', 'virtual_date_night',
                   'heart_to_heart', 'silly_random', 'future_adventures')),
  description    text not null,
  instructions   text not null,
  prompts        text[] not null default '{}',
  minutes        smallint not null check (minutes between 1 and 60),
  energy         text not null check (energy in ('low', 'medium', 'high')),
  activity_type  text not null check (activity_type in ('talking', 'guessing', 'drawing', 'storytelling', 'virtual_date')),
  moods          text[] not null check (moods <@ array['romantic', 'playful', 'silly', 'creative', 'deep', 'relaxed'] and cardinality(moods) > 0),
  materials      text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table public.play_sessions (
  id                 uuid primary key default gen_random_uuid(),
  relationship_id    uuid not null references public.relationships (id) on delete cascade,
  started_by         uuid references auth.users (id) on delete set null,
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  round              int not null default 1,
  filters            jsonb not null default '{}'::jsonb,
  current_item_id    uuid,
  timer_duration_s   int check (timer_duration_s is null or timer_duration_s between 10 and 7200),
  timer_ends_at      timestamptz,       -- set while running
  timer_remaining_s  int,               -- set while paused / ready
  updated_at         timestamptz not null default now(),
  check (timer_ends_at is null or timer_remaining_s is null)
);
create unique index play_sessions_one_open on public.play_sessions (relationship_id) where ended_at is null;
create index play_sessions_history_idx on public.play_sessions (relationship_id, started_at desc);
create trigger play_sessions_touch before update on public.play_sessions
  for each row execute function public.touch_updated_at();

create table public.play_session_items (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.play_sessions (id) on delete cascade,
  activity_id  uuid not null references public.play_activities (id) on delete restrict,
  round        int not null,
  position     int not null,
  status       text not null default 'shown' check (status in ('shown', 'done', 'skipped')),
  drawn_by     uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (session_id, round, activity_id),
  unique (session_id, position)
);

alter table public.play_sessions
  add constraint play_sessions_current_item_fk foreign key (current_item_id)
  references public.play_session_items (id) on delete set null;

create table public.play_favourites (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  activity_id      uuid not null references public.play_activities (id) on delete cascade,
  scope            text not null check (scope in ('mine', 'ours')),
  created_at       timestamptz not null default now()
);
create unique index play_favourites_mine_unique on public.play_favourites (user_id, activity_id) where scope = 'mine';
create unique index play_favourites_ours_unique on public.play_favourites (relationship_id, activity_id) where scope = 'ours';

-- ============================================================ helpers

-- The full state both phones render. Includes the server's clock so each
-- phone can correct for its own clock being a little off.
create or replace function public.play_state(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.play_sessions%rowtype;
  cur jsonb;
begin
  select * into s from public.play_sessions where id = p_session;
  if not found or not public.is_member(s.relationship_id) then
    return null;
  end if;
  select jsonb_build_object(
           'item_id', i.id, 'status', i.status, 'position', i.position, 'round', i.round,
           'activity', to_jsonb(a) - 'is_active' - 'created_at')
    into cur
    from public.play_session_items i join public.play_activities a on a.id = i.activity_id
   where i.id = s.current_item_id;
  return jsonb_build_object(
    'session_id', s.id,
    'started_by', s.started_by,
    'started_at', s.started_at,
    'ended_at', s.ended_at,
    'round', s.round,
    'filters', s.filters,
    'current', cur,
    'played_count', (select count(*) from public.play_session_items where session_id = s.id),
    'timer', jsonb_build_object('duration_s', s.timer_duration_s, 'ends_at', s.timer_ends_at, 'remaining_s', s.timer_remaining_s),
    'server_now', now(),
    'updated_at', s.updated_at
  );
end;
$$;

-- Does an activity match the filters? Every filter is optional.
--   minutes: activities that fit in the time available
--   mood:    any of the chosen moods
--   energy / type: exact
create or replace function public.play_matches(a public.play_activities, f jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select a.is_active
     and (f ->> 'minutes' is null or a.minutes <= (f ->> 'minutes')::int)
     and (coalesce(jsonb_array_length(f -> 'moods'), 0) = 0
          or a.moods && array(select jsonb_array_elements_text(f -> 'moods')))
     and (f ->> 'energy' is null or a.energy = f ->> 'energy')
     and (f ->> 'type' is null or a.activity_type = f ->> 'type');
$$;

-- Keep only recognised filter keys and values.
create or replace function public.clean_play_filters(f jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  out jsonb := '{}'::jsonb;
  m text;
  moods jsonb := '[]'::jsonb;
begin
  if f is null or jsonb_typeof(f) <> 'object' then return out; end if;
  if (f ->> 'minutes') in ('5', '10', '15', '20', '30') then
    out := out || jsonb_build_object('minutes', (f ->> 'minutes')::int);
  end if;
  if jsonb_typeof(f -> 'moods') = 'array' then
    for m in select jsonb_array_elements_text(f -> 'moods') loop
      if m in ('romantic', 'playful', 'silly', 'creative', 'deep', 'relaxed') and not moods ? m then
        moods := moods || to_jsonb(m);
      end if;
    end loop;
    if jsonb_array_length(moods) > 0 then out := out || jsonb_build_object('moods', moods); end if;
  end if;
  if (f ->> 'energy') in ('low', 'medium', 'high') then
    out := out || jsonb_build_object('energy', f ->> 'energy');
  end if;
  if (f ->> 'type') in ('talking', 'guessing', 'drawing', 'storytelling', 'virtual_date') then
    out := out || jsonb_build_object('type', f ->> 'type');
  end if;
  return out;
end;
$$;

-- ============================================================ RPCs

-- Open the couple's current session, or start one. Both phones get the same.
create or replace function public.start_play_session()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rel uuid := public.my_relationship_id();
  sid uuid;
begin
  if uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  perform 1 from public.relationships r where r.id = rel and r.status = 'active' for update;
  if not found then
    raise exception 'Play With Me opens once your partner has joined.' using errcode = 'P0001';
  end if;
  select id into sid from public.play_sessions where relationship_id = rel and ended_at is null;
  if sid is null then
    insert into public.play_sessions (relationship_id, started_by) values (rel, uid) returning id into sid;
  end if;
  return sid;
end;
$$;

-- Draw the next activity that matches the filters (or play a specific one,
-- e.g. from favourites). Returns the new state, with "reshuffled": true when
-- the round restarted.
create or replace function public.draw_play_activity(p_session uuid, p_filters jsonb default '{}'::jsonb, p_activity uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s        public.play_sessions%rowtype;
  f        jsonb := public.clean_play_filters(p_filters);
  pick     public.play_activities%rowtype;
  item_id  uuid;
  reshuffled boolean := false;
  last_act uuid;
begin
  select * into s from public.play_sessions where id = p_session for update;
  if not found or not public.is_member(s.relationship_id) then
    raise exception 'That play session isn''t available.' using errcode = 'P0001';
  end if;
  if s.ended_at is not null then
    raise exception 'That session has ended. Start a new one!' using errcode = 'P0001';
  end if;

  select i.activity_id into last_act from public.play_session_items i where i.id = s.current_item_id;

  if p_activity is not null then
    select a.* into pick from public.play_activities a where a.id = p_activity and a.is_active;
    if not found then
      raise exception 'That activity isn''t available.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.play_session_items i where i.session_id = s.id and i.round = s.round and i.activity_id = pick.id) then
      s.round := s.round + 1;   -- already played this round: start a fresh round so it can be played again
      reshuffled := true;
    end if;
    f := s.filters;            -- keep the session's filters for later draws
  else
  if not exists (select 1 from public.play_activities a where public.play_matches(a, f)) then
    raise exception 'Nothing matches all of those filters. Try removing one.' using errcode = 'P0001';
  end if;

  select a.* into pick from public.play_activities a
   where public.play_matches(a, f)
     and not exists (select 1 from public.play_session_items i
                      where i.session_id = s.id and i.round = s.round and i.activity_id = a.id)
   order by random() limit 1;

  if not found then
    -- Everything matching has been played this round: reshuffle.
    s.round := s.round + 1;
    reshuffled := true;
    select a.* into pick from public.play_activities a
     where public.play_matches(a, f) and a.id is distinct from last_act
     order by random() limit 1;
    if not found then  -- only one activity matches: allow it again
      select a.* into pick from public.play_activities a where public.play_matches(a, f) order by random() limit 1;
    end if;
  end if;
  end if;

  insert into public.play_session_items (session_id, activity_id, round, position, drawn_by)
  values (s.id, pick.id, s.round,
          coalesce((select max(position) from public.play_session_items where session_id = s.id), 0) + 1,
          auth.uid())
  returning id into item_id;

  update public.play_sessions
     set round = s.round, filters = f, current_item_id = item_id,
         timer_duration_s = pick.minutes * 60, timer_ends_at = null, timer_remaining_s = pick.minutes * 60
   where id = s.id;

  return public.play_state(s.id) || jsonb_build_object('reshuffled', reshuffled);
end;
$$;

-- Mark the current (or any) item done or skipped.
create or replace function public.set_play_item_status(p_item uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
begin
  if p_status not in ('shown', 'done', 'skipped') then
    raise exception 'Unknown status.' using errcode = '22023';
  end if;
  select i.session_id into sid
    from public.play_session_items i join public.play_sessions s on s.id = i.session_id
   where i.id = p_item and public.is_member(s.relationship_id);
  if sid is null then
    raise exception 'That activity isn''t available.' using errcode = 'P0001';
  end if;
  update public.play_session_items set status = p_status where id = p_item;
  update public.play_sessions set updated_at = now() where id = sid;  -- nudges the other phone
  return public.play_state(sid);
end;
$$;

-- Shared timer: start / pause / reset (optionally to a new length in seconds).
create or replace function public.play_timer(p_session uuid, p_action text, p_duration_s int default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.play_sessions%rowtype;
  dur int;
begin
  select * into s from public.play_sessions where id = p_session for update;
  if not found or not public.is_member(s.relationship_id) or s.ended_at is not null then
    raise exception 'That play session isn''t available.' using errcode = 'P0001';
  end if;
  dur := coalesce(p_duration_s, s.timer_duration_s, 600);
  if dur < 10 or dur > 7200 then
    raise exception 'Timers can be 10 seconds to 2 hours.' using errcode = '22023';
  end if;

  if p_action = 'start' then
    if s.timer_ends_at is null then
      update public.play_sessions
         set timer_duration_s = coalesce(s.timer_duration_s, dur),
             timer_ends_at = now() + make_interval(secs => greatest(coalesce(s.timer_remaining_s, dur), 1)),
             timer_remaining_s = null
       where id = s.id;
    end if;
  elsif p_action = 'pause' then
    if s.timer_ends_at is not null then
      update public.play_sessions
         set timer_remaining_s = greatest(0, ceil(extract(epoch from (s.timer_ends_at - now())))::int),
             timer_ends_at = null
       where id = s.id;
    end if;
  elsif p_action = 'reset' then
    update public.play_sessions
       set timer_duration_s = dur, timer_ends_at = null, timer_remaining_s = dur
     where id = s.id;
  else
    raise exception 'Unknown timer action.' using errcode = '22023';
  end if;
  return public.play_state(s.id);
end;
$$;

create or replace function public.end_play_session(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.play_sessions
     set ended_at = now(), timer_ends_at = null
   where id = p_session and ended_at is null and public.is_member(relationship_id);
end;
$$;

-- The couple's open session, if any (null otherwise).
create or replace function public.current_play_state()
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.play_state(s.id) from public.play_sessions s
   where s.relationship_id = public.my_relationship_id() and s.ended_at is null;
$$;

-- Toggle a favourite. Returns true if it is now saved.
create or replace function public.toggle_play_favourite(p_activity uuid, p_scope text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rel uuid := public.my_relationship_id();
begin
  if uid is null or rel is null then
    raise exception 'Please sign in to your space first.' using errcode = 'P0001';
  end if;
  if p_scope not in ('mine', 'ours') then
    raise exception 'Unknown list.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.play_activities where id = p_activity and is_active) then
    raise exception 'That activity isn''t available.' using errcode = 'P0001';
  end if;
  if p_scope = 'mine' then
    delete from public.play_favourites where user_id = uid and activity_id = p_activity and scope = 'mine';
  else
    delete from public.play_favourites where relationship_id = rel and activity_id = p_activity and scope = 'ours';
  end if;
  if found then return false; end if;
  insert into public.play_favourites (relationship_id, user_id, activity_id, scope) values (rel, uid, p_activity, p_scope);
  return true;
end;
$$;

-- ================================================================== RLS
alter table public.play_activities    enable row level security;
alter table public.play_sessions      enable row level security;
alter table public.play_session_items enable row level security;
alter table public.play_favourites    enable row level security;

create policy "play activities: signed-in read" on public.play_activities
  for select to authenticated using (is_active);
create policy "play sessions: members read" on public.play_sessions
  for select to authenticated using (public.is_member(relationship_id));
create policy "play items: members read" on public.play_session_items
  for select to authenticated using (exists (
    select 1 from public.play_sessions s where s.id = session_id and public.is_member(s.relationship_id)));
create policy "play favourites: mine, or ours" on public.play_favourites
  for select to authenticated using (
    public.is_member(relationship_id) and (scope = 'ours' or user_id = auth.uid()));

revoke all on public.play_activities, public.play_sessions, public.play_session_items, public.play_favourites from anon, authenticated;
grant select on public.play_activities, public.play_sessions, public.play_session_items, public.play_favourites to authenticated;

revoke execute on function
  public.play_state(uuid), public.play_matches(public.play_activities, jsonb), public.clean_play_filters(jsonb),
  public.start_play_session(), public.draw_play_activity(uuid, jsonb, uuid), public.set_play_item_status(uuid, text),
  public.play_timer(uuid, text, int), public.end_play_session(uuid), public.current_play_state(),
  public.toggle_play_favourite(uuid, text)
  from public, anon;
grant execute on function
  public.play_state(uuid), public.start_play_session(), public.draw_play_activity(uuid, jsonb, uuid),
  public.set_play_item_status(uuid, text), public.play_timer(uuid, text, int), public.end_play_session(uuid),
  public.current_play_state(), public.toggle_play_favourite(uuid, text)
  to authenticated;

-- ============================================================ realtime
-- Lets each phone hear the other's taps instantly (the app also polls as a
-- fallback). Realtime respects the RLS policies above.
do $rt$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.play_sessions;
    exception when duplicate_object then null;
    end;
  else
    raise notice 'Realtime publication not found: the app will sync by polling.';
  end if;
end
$rt$;
