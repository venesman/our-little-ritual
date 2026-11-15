-- =====================================================================
-- Our Little Ritual — Personalisation ("Our Story") + Apart, anytime
--
-- Three layers, all editable by both partners:
--   1. Individual profile   — on public.profiles (location, home country,
--                              institution, situation, interests, languages…)
--   2. Current life updates — public.life_updates (short posts about now)
--   3. Shared profile       — public.relationship_profile + public.milestones
--
-- Activities never hardcode places, institutions or languages. Personalised
-- ("Just us") activities carry [tokens] filled from the profiles on each
-- phone, plus a general fallback used when a needed detail is missing.
-- Nationality, home country and institution are never treated as the
-- current location.
--
-- Apart, anytime: asynchronous "missions" each partner completes on their
-- own time. Solo/same-thing missions stay sealed until both have shared;
-- relay missions are visible as you go.
-- =====================================================================

-- ============================================== 1. individual profile
alter table public.profiles
  add column current_city       text check (current_city is null or char_length(current_city) <= 60),
  add column current_country    text check (current_country is null or char_length(current_country) <= 60),
  add column home_country       text check (home_country is null or char_length(home_country) <= 60),
  add column institution        text check (institution is null or char_length(institution) <= 80),
  add column situation          text check (situation is null or char_length(situation) <= 80),
  add column interests          text[] not null default '{}',
  add column languages_spoken   text[] not null default '{}',
  add column languages_learning text[] not null default '{}',
  add column sharing_now        text not null default '' check (char_length(sharing_now) <= 600);

-- Clean a list of short labels: trimmed, unique, at most 20 items of 40 chars.
create or replace function public.clean_labels(p jsonb)
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  out text[] := '{}';
  v text;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return out; end if;
  for v in select trim(x) from jsonb_array_elements_text(p) x loop
    if v <> '' and char_length(v) <= 40 and not v = any (out) then out := out || v; end if;
  end loop;
  if cardinality(out) > 20 then
    raise exception 'Please keep each list to 20 items or fewer.' using errcode = '22023';
  end if;
  return out;
end;
$$;

-- Either partner may update either profile ("both edit everything").
-- Only the listed keys are accepted; anything else is ignored.
create or replace function public.update_member_profile(p_user uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p jsonb := coalesce(p_patch, '{}'::jsonb);
  t text;
  v text;
  lim int;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  if p_user is distinct from auth.uid() and not public.shares_relationship(p_user) then
    raise exception 'You can only edit profiles in your own space.' using errcode = 'P0001';
  end if;

  foreach t in array array['display_name', 'current_city', 'current_country', 'home_country', 'institution', 'situation'] loop
    if p ? t then
      v := nullif(trim(coalesce(p ->> t, '')), '');
      lim := case when t = 'display_name' then 40 when t in ('institution', 'situation') then 80 else 60 end;
      if v is not null and char_length(v) > lim then
        raise exception 'That % is a little long.', replace(t, '_', ' ') using errcode = '22001';
      end if;
      execute format('update public.profiles set %I = $1 where id = $2', t)
        using (case when t = 'display_name' then coalesce(v, '') else v end), p_user;
    end if;
  end loop;

  if p ? 'sharing_now' then
    v := trim(coalesce(p ->> 'sharing_now', ''));
    if char_length(v) > 600 then
      raise exception 'Please keep that under 600 characters.' using errcode = '22001';
    end if;
    update public.profiles set sharing_now = v where id = p_user;
  end if;

  foreach t in array array['interests', 'languages_spoken', 'languages_learning'] loop
    if p ? t then
      execute format('update public.profiles set %I = $1 where id = $2', t) using public.clean_labels(p -> t), p_user;
    end if;
  end loop;

  if p ? 'timezone' then
    v := trim(coalesce(p ->> 'timezone', ''));
    if v = '' or char_length(v) > 64 or not exists (select 1 from pg_timezone_names where name = v) then
      raise exception 'Please choose a valid time zone.' using errcode = '22023';
    end if;
    update public.profiles set timezone = v where id = p_user;
  end if;

  if p ? 'free_from' or p ? 'free_to' then
    begin
      update public.profiles
         set free_from = nullif(p ->> 'free_from', '')::time, free_to = nullif(p ->> 'free_to', '')::time
       where id = p_user;
    exception when check_violation or invalid_datetime_format then
      raise exception 'Please set both a start and an end time (different from each other), or clear both.' using errcode = '22023';
    end;
  end if;
end;
$$;

-- ============================================ 2. current life updates
create table public.life_updates (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  body             text not null check (char_length(body) between 1 and 500),
  created_at       timestamptz not null default now()
);
create index life_updates_rel_idx on public.life_updates (relationship_id, created_at desc);

create or replace function public.add_life_update(p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
  v   text := trim(coalesce(p_body, ''));
  id  uuid;
begin
  if rel is null then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
  if v = '' or char_length(v) > 500 then
    raise exception 'Updates can be 1 to 500 characters.' using errcode = '22023';
  end if;
  insert into public.life_updates (relationship_id, user_id, body) values (rel, auth.uid(), v) returning life_updates.id into id;
  return id;
end;
$$;

create or replace function public.delete_life_update(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.life_updates where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'You can only remove your own updates.' using errcode = 'P0001';
  end if;
end;
$$;

-- =========================================== 3. shared relationship profile
create table public.relationship_profile (
  relationship_id  uuid primary key references public.relationships (id) on delete cascade,
  shared_interests text[] not null default '{}',
  enjoy_together   text[] not null default '{}',
  shared_goals     text not null default '' check (char_length(shared_goals) <= 1000),
  updated_at       timestamptz not null default now()
);

create or replace function public.save_shared_profile(p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
  p jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  if rel is null then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p ->> 'shared_goals', '')) > 1000 then
    raise exception 'Please keep shared goals under 1,000 characters.' using errcode = '22001';
  end if;
  insert into public.relationship_profile (relationship_id) values (rel) on conflict do nothing;
  update public.relationship_profile set
    shared_interests = case when p ? 'shared_interests' then public.clean_labels(p -> 'shared_interests') else shared_interests end,
    enjoy_together   = case when p ? 'enjoy_together' then public.clean_labels(p -> 'enjoy_together') else enjoy_together end,
    shared_goals     = case when p ? 'shared_goals' then trim(coalesce(p ->> 'shared_goals', '')) else shared_goals end,
    updated_at       = now()
  where relationship_id = rel;
end;
$$;

create table public.milestones (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  kind             text not null default 'milestone' check (kind in ('milestone', 'important_date', 'memory')),
  title            text not null check (char_length(title) between 1 and 80),
  happened_on      date,
  note             text not null default '' check (char_length(note) <= 500),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index milestones_rel_idx on public.milestones (relationship_id, happened_on);

create or replace function public.save_milestone(p_id uuid, p_kind text, p_title text, p_happened_on date default null, p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
  v_title text := trim(coalesce(p_title, ''));
  v_note  text := trim(coalesce(p_note, ''));
  v_id uuid;
begin
  if rel is null then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
  if p_kind not in ('milestone', 'important_date', 'memory') then
    raise exception 'Unknown kind.' using errcode = '22023';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 80 then
    raise exception 'Please give it a title (up to 80 characters).' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'Please keep the note under 500 characters.' using errcode = '22001';
  end if;
  if p_id is null then
    if (select count(*) from public.milestones where relationship_id = rel) >= 300 then
      raise exception 'That''s a lot of milestones! Remove a few first.' using errcode = 'P0001';
    end if;
    insert into public.milestones (relationship_id, kind, title, happened_on, note, created_by)
    values (rel, p_kind, v_title, p_happened_on, v_note, auth.uid()) returning id into v_id;
  else
    update public.milestones m set kind = p_kind, title = v_title, happened_on = p_happened_on, note = v_note
     where m.id = p_id and m.relationship_id = rel returning m.id into v_id;
    if v_id is null then
      raise exception 'We couldn''t find that.' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_milestone(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.milestones where id = p_id and relationship_id = public.my_relationship_id();
  if not found then
    raise exception 'We couldn''t find that.' using errcode = 'P0001';
  end if;
end;
$$;

-- ================================== Just us: weekly rituals + Monday switch
alter table public.relationships add column include_just_us_weekly boolean not null default true;

create or replace function public.set_include_just_us_weekly(p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.relationships set include_just_us_weekly = coalesce(p_on, true) where id = public.my_relationship_id();
  if not found then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
end;
$$;

alter table public.activities
  add column just_us boolean not null default false,
  add column needs text[] not null default '{}',
  add column fallback_instructions text;

-- Weekly generator: Just us rituals join the rotation only if the couple has it switched on.
create or replace function public.assign_weekly_activity(p_relationship uuid, p_week_start timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  wk_id        uuid;
  cyc          public.activity_cycles%rowtype;
  active_total int;
  used_total   int;
  last_cat     text;
  last_act     uuid;
  pick_cat     text;
  pick_act     uuid;
  next_week_no int;
  v_include    boolean;
begin
  if p_week_start <> public.ritual_week_start(p_week_start) then
    raise exception 'Week must start on a Monday at 12:00 UTC.' using errcode = '22023';
  end if;

  -- Serialise everyone generating for this relationship.
  perform 1 from public.relationships r
   where r.id = p_relationship and r.status = 'active'
   for update;
  if not found then
    raise exception 'Your weekly ritual begins once your partner has joined.' using errcode = 'P0001';
  end if;

  select coalesce(r.include_just_us_weekly, true) into v_include from public.relationships r where r.id = p_relationship;

  select w.id into wk_id from public.weekly_activities w
   where w.relationship_id = p_relationship and w.week_start = p_week_start;
  if found then
    return wk_id;
  end if;

  -- Last week's choice, to avoid repeating a category back to back.
  select a.category, a.id into last_cat, last_act
    from public.weekly_activities w join public.activities a on a.id = w.activity_id
   where w.relationship_id = p_relationship
   order by w.week_start desc limit 1;

  -- Current open cycle (or the first one).
  select * into cyc from public.activity_cycles c
   where c.relationship_id = p_relationship and c.completed_at is null;
  if not found then
    insert into public.activity_cycles (relationship_id, cycle_number)
    values (p_relationship, coalesce((select max(cycle_number) from public.activity_cycles
                                      where relationship_id = p_relationship), 0) + 1)
    returning * into cyc;
  end if;

  select count(*) into active_total from public.activities where is_active and (not just_us or v_include);
  select count(*) into used_total
    from public.weekly_activities w join public.activities a on a.id = w.activity_id
   where w.cycle_id = cyc.id and a.is_active and (not a.just_us or v_include);

  -- Cycle finished: close it and reshuffle.
  if used_total >= active_total then
    update public.activity_cycles set completed_at = now() where id = cyc.id;
    insert into public.activity_cycles (relationship_id, cycle_number)
    values (p_relationship, cyc.cycle_number + 1)
    returning * into cyc;
  end if;

  -- Least-used category among those with something left; prefer not last week's.
  select cat into pick_cat from (
    select a.category as cat,
           count(w.id) as used,
           count(*) filter (where w.id is null) as remaining
      from public.activities a
      left join public.weekly_activities w on w.activity_id = a.id and w.cycle_id = cyc.id
     where a.is_active and (not a.just_us or v_include)
     group by a.category
  ) s
  where remaining > 0
  order by used asc, (cat = last_cat) asc, random()
  limit 1;

  -- A random unused activity in it (never last week's exact activity).
  select a.id into pick_act
    from public.activities a
   where a.is_active and (not a.just_us or v_include) and a.category = pick_cat
     and a.id is distinct from last_act
     and not exists (select 1 from public.weekly_activities w
                      where w.cycle_id = cyc.id and w.activity_id = a.id)
   order by random() limit 1;

  if pick_act is null then   -- only possible if the sole remaining one was last week's
    select a.id into pick_act from public.activities a
     where a.is_active and (not a.just_us or v_include)
       and not exists (select 1 from public.weekly_activities w
                        where w.cycle_id = cyc.id and w.activity_id = a.id)
     order by random() limit 1;
  end if;

  select coalesce(max(week_number), 0) + 1 into next_week_no
    from public.weekly_activities where relationship_id = p_relationship;

  insert into public.weekly_activities (relationship_id, cycle_id, activity_id, week_start, week_number)
  values (p_relationship, cyc.id, pick_act, p_week_start, next_week_no)
  returning id into wk_id;

  return wk_id;
end;
$$;

-- ==================================================== Play With Me changes
alter table public.play_activities drop constraint if exists play_activities_activity_type_check;
alter table public.play_activities
  add constraint play_activities_activity_type_check check (activity_type in (
    'talking', 'guessing', 'drawing', 'storytelling', 'virtual_date', 'photo', 'writing', 'research')),
  add column mode text not null default 'call' check (mode in ('call', 'apart')),
  add column style text check (style is null or style in ('solo', 'relay', 'same')),
  add column just_us boolean not null default false,
  add column needs text[] not null default '{}',
  add column fallback_instructions text,
  add column share_as text,
  add constraint play_activities_style_for_apart check ((mode = 'apart') = (style is not null));

-- Filters now also carry mode (call / apart) and just_us (on / off).
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
  if (f ->> 'type') in ('talking', 'guessing', 'drawing', 'storytelling', 'virtual_date', 'photo', 'writing', 'research') then
    out := out || jsonb_build_object('type', f ->> 'type');
  end if;
  if (f ->> 'mode') = 'apart' then
    out := out || jsonb_build_object('mode', 'apart');
  end if;
  if (f ->> 'just_us') = 'true' then
    out := out || jsonb_build_object('just_us', true);
  end if;
  return out;
end;
$$;

create or replace function public.play_matches(a public.play_activities, f jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select a.is_active
     and a.mode = coalesce(f ->> 'mode', 'call')
     and a.just_us = coalesce((f ->> 'just_us')::boolean, false)
     and (f ->> 'minutes' is null or a.minutes <= (f ->> 'minutes')::int)
     and (coalesce(jsonb_array_length(f -> 'moods'), 0) = 0
          or a.moods && array(select jsonb_array_elements_text(f -> 'moods')))
     and (f ->> 'energy' is null or a.energy = f ->> 'energy')
     and (f ->> 'type' is null or a.activity_type = f ->> 'type');
$$;

-- Call plans use general, on-a-call activities only.
create or replace function public.slot_fits(a public.play_activities, p_slot text)
returns boolean language sql immutable set search_path = '' as $$
  select a.is_active and a.mode = 'call' and not a.just_us and case p_slot
    when 'warm_up'  then a.category in ('guess_discover', 'silly_random') and a.energy <> 'high'
    when 'guessing' then a.activity_type = 'guessing'
    when 'creative' then a.category = 'creative_chaos'
    when 'date'     then a.category = 'virtual_date_night'
    when 'heart'    then a.category = 'heart_to_heart'
    when 'future'   then a.category = 'future_adventures'
    when 'closing'  then 'romantic' = any (a.moods) and a.energy = 'low'
    else false end;
$$;

create or replace function public.pick_for_slot(p_session uuid, p_round int, p_slot text, p_minutes int)
returns uuid language sql volatile set search_path = '' as $$
  select a.id
    from public.play_activities a
   where a.is_active and a.mode = 'call' and not a.just_us and a.minutes <= p_minutes
   order by
     (not public.slot_fits(a, p_slot)),
     exists (select 1 from public.play_session_items i
              where i.session_id = p_session and i.round = p_round and i.activity_id = a.id),
     a.minutes desc,
     random()
   limit 1;
$$;

-- ======================================================= Apart, anytime
create table public.apart_missions (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  activity_id      uuid not null references public.play_activities (id) on delete restrict,
  started_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  closed_at        timestamptz
);
create index apart_missions_rel_idx on public.apart_missions (relationship_id, created_at desc);

create table public.apart_entries (
  id               uuid primary key default gen_random_uuid(),
  mission_id       uuid not null references public.apart_missions (id) on delete cascade,
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  body             text not null default '' check (char_length(body) <= 2000),
  link_url         text check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 500)),
  image_path       text check (image_path is null or char_length(image_path) <= 300),
  created_at       timestamptz not null default now(),
  check (body <> '' or link_url is not null or image_path is not null)
);
create index apart_entries_mission_idx on public.apart_entries (mission_id, created_at);

-- Relay missions are visible as you go. Solo / same-thing missions open once both have shared.
create or replace function public.apart_visible(p_mission uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.apart_missions m join public.play_activities a on a.id = m.activity_id
     where m.id = p_mission and public.is_member(m.relationship_id)
       and (a.style = 'relay'
            or (select count(distinct e.user_id) from public.apart_entries e where e.mission_id = m.id) >= 2));
$$;

create or replace function public.start_apart_mission(p_filters jsonb default '{}'::jsonb, p_activity uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rel uuid := public.my_relationship_id();
  f   jsonb := public.clean_play_filters(coalesce(p_filters, '{}'::jsonb) || '{"mode":"apart"}'::jsonb);
  act uuid;
  mid uuid;
begin
  if uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  perform 1 from public.relationships r where r.id = rel and r.status = 'active' for update;
  if not found then
    raise exception 'Apart missions open once your partner has joined.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.apart_missions where relationship_id = rel and closed_at is null) >= 6 then
    raise exception 'You have six missions on the go — finish or close one first.' using errcode = 'P0001';
  end if;

  if p_activity is not null then
    select a.id into act from public.play_activities a where a.id = p_activity and a.is_active and a.mode = 'apart';
    if act is null then
      raise exception 'That mission isn''t available.' using errcode = 'P0001';
    end if;
  else
    if not exists (select 1 from public.play_activities a where public.play_matches(a, f)) then
      raise exception 'Nothing matches all of those filters. Try removing one.' using errcode = 'P0001';
    end if;
    -- Prefer missions you haven't done before; once all matching ones are used, any can come back.
    select a.id into act from public.play_activities a
     where public.play_matches(a, f)
     order by exists (select 1 from public.apart_missions m where m.relationship_id = rel and m.activity_id = a.id), random()
     limit 1;
  end if;

  insert into public.apart_missions (relationship_id, activity_id, started_by) values (rel, act, uid) returning id into mid;
  return mid;
end;
$$;

create or replace function public.add_apart_entry(p_mission uuid, p_body text default '', p_link_url text default null, p_image_path text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  m    public.apart_missions%rowtype;
  link text := nullif(trim(coalesce(p_link_url, '')), '');
  img  text := nullif(trim(coalesce(p_image_path, '')), '');
  b    text := trim(coalesce(p_body, ''));
  eid  uuid;
begin
  select * into m from public.apart_missions where id = p_mission for update;
  if not found or not public.is_member(m.relationship_id) then
    raise exception 'That mission isn''t available.' using errcode = 'P0001';
  end if;
  if m.closed_at is not null then
    raise exception 'That mission is closed.' using errcode = 'P0001';
  end if;
  if char_length(b) > 2000 then
    raise exception 'Please keep it under 2,000 characters.' using errcode = '22001';
  end if;
  if link is not null and (link !~ '^https://[^\s]+$' or char_length(link) > 500) then
    raise exception 'Links need to start with https://' using errcode = '22023';
  end if;
  if img is not null and img !~ ('^' || m.relationship_id::text || '/' || m.id::text || '/' || uid::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'That image can''t be attached here.' using errcode = '22023';
  end if;
  if b = '' and link is null and img is null then
    raise exception 'Add some words, a photo or a link first.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.apart_entries where mission_id = m.id) >= 100 then
    raise exception 'This mission is full — start a new one!' using errcode = 'P0001';
  end if;
  insert into public.apart_entries (mission_id, relationship_id, user_id, body, link_url, image_path)
  values (m.id, m.relationship_id, uid, b, link, img) returning id into eid;
  return eid;
end;
$$;

create or replace function public.close_apart_mission(p_mission uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.apart_missions set closed_at = now()
   where id = p_mission and closed_at is null and public.is_member(relationship_id);
end;
$$;

-- Missions with status only (no partner content before it's visible).
create or replace function public.my_apart_missions(p_include_closed boolean default false)
returns table (mission_id uuid, activity_id uuid, created_at timestamptz, closed_at timestamptz,
               my_entries int, partner_entries int, visible boolean, last_entry_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.activity_id, m.created_at, m.closed_at,
         (select count(*)::int from public.apart_entries e where e.mission_id = m.id and e.user_id = auth.uid()),
         (select count(*)::int from public.apart_entries e where e.mission_id = m.id and e.user_id <> auth.uid()),
         public.apart_visible(m.id),
         (select max(e.created_at) from public.apart_entries e where e.mission_id = m.id)
    from public.apart_missions m
   where m.relationship_id = public.my_relationship_id()
     and (p_include_closed or m.closed_at is null)
   order by m.created_at desc
   limit 60;
$$;

-- Storage for Apart photos and drawings: <relationship>/<mission>/<user>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('apart-media', 'apart-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_edit_apart_media(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
  rel uuid; mid uuid; usr uuid;
begin
  if array_length(parts, 1) <> 4 then return false; end if;
  begin rel := parts[1]::uuid; mid := parts[2]::uuid; usr := parts[3]::uuid; exception when others then return false; end;
  return usr = auth.uid() and public.is_member(rel)
     and exists (select 1 from public.apart_missions m where m.id = mid and m.relationship_id = rel and m.closed_at is null)
     and not exists (select 1 from public.apart_entries e where e.image_path = p_name);  -- attached files are final
end;
$$;

create or replace function public.can_view_apart_media(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
  rel uuid; mid uuid; usr uuid;
begin
  if array_length(parts, 1) <> 4 then return false; end if;
  begin rel := parts[1]::uuid; mid := parts[2]::uuid; usr := parts[3]::uuid; exception when others then return false; end;
  if not public.is_member(rel) then return false; end if;
  if usr = auth.uid() then return true; end if;
  return public.apart_visible(mid)
     and exists (select 1 from public.apart_entries e where e.mission_id = mid and e.user_id = usr and e.image_path = p_name);
end;
$$;

create policy "apart-media: read own or visible" on storage.objects
  for select to authenticated using (bucket_id = 'apart-media' and public.can_view_apart_media(name));
create policy "apart-media: upload to own open mission" on storage.objects
  for insert to authenticated with check (bucket_id = 'apart-media' and public.can_edit_apart_media(name));
create policy "apart-media: delete unattached own" on storage.objects
  for delete to authenticated using (bucket_id = 'apart-media' and public.can_edit_apart_media(name));

-- ================================================================== RLS
alter table public.life_updates         enable row level security;
alter table public.relationship_profile enable row level security;
alter table public.milestones           enable row level security;
alter table public.apart_missions       enable row level security;
alter table public.apart_entries        enable row level security;

create policy "life updates: members read" on public.life_updates
  for select to authenticated using (public.is_member(relationship_id));
create policy "shared profile: members read" on public.relationship_profile
  for select to authenticated using (public.is_member(relationship_id));
create policy "milestones: members read" on public.milestones
  for select to authenticated using (public.is_member(relationship_id));
create policy "apart missions: members read" on public.apart_missions
  for select to authenticated using (public.is_member(relationship_id));
create policy "apart entries: own, or partner's when visible" on public.apart_entries
  for select to authenticated using (user_id = auth.uid() or public.apart_visible(mission_id));

revoke all on public.life_updates, public.relationship_profile, public.milestones, public.apart_missions, public.apart_entries from anon, authenticated;
grant select on public.life_updates, public.relationship_profile, public.milestones, public.apart_missions, public.apart_entries to authenticated;

-- New profile columns are written only through update_member_profile().
grant select on public.profiles to authenticated;

revoke execute on function
  public.clean_labels(jsonb), public.update_member_profile(uuid, jsonb), public.add_life_update(text), public.delete_life_update(uuid),
  public.save_shared_profile(jsonb), public.save_milestone(uuid, text, text, date, text), public.delete_milestone(uuid),
  public.set_include_just_us_weekly(boolean), public.apart_visible(uuid), public.start_apart_mission(jsonb, uuid),
  public.add_apart_entry(uuid, text, text, text), public.close_apart_mission(uuid), public.my_apart_missions(boolean),
  public.can_edit_apart_media(text), public.can_view_apart_media(text)
  from public, anon;
revoke execute on function public.clean_labels(jsonb) from authenticated;
grant execute on function
  public.update_member_profile(uuid, jsonb), public.add_life_update(text), public.delete_life_update(uuid),
  public.save_shared_profile(jsonb), public.save_milestone(uuid, text, text, date, text), public.delete_milestone(uuid),
  public.set_include_just_us_weekly(boolean), public.apart_visible(uuid), public.start_apart_mission(jsonb, uuid),
  public.add_apart_entry(uuid, text, text, text), public.close_apart_mission(uuid), public.my_apart_missions(boolean),
  public.can_edit_apart_media(text), public.can_view_apart_media(text)
  to authenticated;
-- Re-revoke helpers whose definitions were replaced above.
revoke execute on function public.play_matches(public.play_activities, jsonb), public.clean_play_filters(jsonb),
  public.slot_fits(public.play_activities, text), public.pick_for_slot(uuid, int, text, int) from public, anon, authenticated;
revoke execute on function public.assign_weekly_activity(uuid, timestamptz) from public, anon, authenticated;

-- Live updates for new missions/entries (falls back to polling if unavailable).
do $rt$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.apart_entries; exception when duplicate_object then null; end;
  end if;
end
$rt$;
