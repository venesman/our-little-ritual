-- =====================================================================
-- Our Little Ritual — Phase 6: Call Session Mode
-- A planned sequence of Play With Me activities for the time you have.
--
--   * generate_call_plan(minutes) builds slots, e.g. 45 min:
--       warm-up 5 · guessing 10 · creative 15 · heart to heart 10 · closing 5
--     Each slot picks an activity that fits its minutes and theme, with no
--     duplicates in the plan (and avoiding ones already played this round).
--   * Both phones see the same plan (it lives in play_sessions / items).
--   * Done / skip move to the next step and set the shared timer to it.
--     Replace swaps a step for another that fits. Nothing is forced.
--   * A normal "Surprise us" draw leaves the plan; ending the session saves
--     it to history.
-- =====================================================================

alter table public.play_sessions
  add column mode text not null default 'single' check (mode in ('single', 'planned')),
  add column planned_minutes int check (planned_minutes is null or planned_minutes in (15, 30, 45, 60, 90)),
  add column plan_start_position int;  -- first step of the current plan

alter table public.play_session_items
  add column slot text check (slot is null or slot in ('warm_up', 'guessing', 'creative', 'date', 'heart', 'future', 'closing')),
  add column planned_minutes int check (planned_minutes is null or planned_minutes between 1 and 60);

alter table public.play_session_items drop constraint if exists play_session_items_status_check;
alter table public.play_session_items
  add constraint play_session_items_status_check check (status in ('planned', 'shown', 'done', 'skipped'));

-- ------------------------------------------------------------ slots
-- The sequence for each length. Order matters.
create or replace function public.call_plan_slots(p_total int)
returns table (ord int, slot text, minutes int)
language sql immutable set search_path = '' as $$
  select t.ord, t.slot, t.minutes from (values
    (15, 1, 'warm_up', 5), (15, 2, 'heart', 5), (15, 3, 'closing', 5),
    (30, 1, 'warm_up', 5), (30, 2, 'guessing', 10), (30, 3, 'heart', 10), (30, 4, 'closing', 5),
    (45, 1, 'warm_up', 5), (45, 2, 'guessing', 10), (45, 3, 'creative', 15), (45, 4, 'heart', 10), (45, 5, 'closing', 5),
    (60, 1, 'warm_up', 5), (60, 2, 'guessing', 10), (60, 3, 'creative', 15), (60, 4, 'date', 15), (60, 5, 'heart', 10), (60, 6, 'closing', 5),
    (90, 1, 'warm_up', 5), (90, 2, 'guessing', 10), (90, 3, 'creative', 15), (90, 4, 'date', 30), (90, 5, 'heart', 10), (90, 6, 'future', 15), (90, 7, 'closing', 5)
  ) as t(total, ord, slot, minutes)
  where t.total = p_total
  order by t.ord;
$$;

-- Does an activity suit a slot (ignoring length)?
create or replace function public.slot_fits(a public.play_activities, p_slot text)
returns boolean language sql immutable set search_path = '' as $$
  select a.is_active and case p_slot
    when 'warm_up'  then a.category in ('guess_discover', 'silly_random') and a.energy <> 'high'
    when 'guessing' then a.activity_type = 'guessing'
    when 'creative' then a.category = 'creative_chaos'
    when 'date'     then a.category = 'virtual_date_night'
    when 'heart'    then a.category = 'heart_to_heart'
    when 'future'   then a.category = 'future_adventures'
    when 'closing'  then 'romantic' = any (a.moods) and a.energy = 'low'
    else false end;
$$;

-- Pick an activity for a slot: fits the theme, takes no longer than the slot
-- (closest to it first), not already in this session's round. Falls back to
-- any theme, then to repeats, so a plan can always be made.
create or replace function public.pick_for_slot(p_session uuid, p_round int, p_slot text, p_minutes int)
returns uuid language sql volatile set search_path = '' as $$
  select a.id
    from public.play_activities a
   where a.is_active and a.minutes <= p_minutes
   order by
     (not public.slot_fits(a, p_slot)),
     exists (select 1 from public.play_session_items i
              where i.session_id = p_session and i.round = p_round and i.activity_id = a.id),
     a.minutes desc,
     random()
   limit 1;
$$;

-- ------------------------------------------------------------ state
create or replace function public.play_state(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s   public.play_sessions%rowtype;
  cur jsonb;
  plan jsonb;
begin
  select * into s from public.play_sessions where id = p_session;
  if not found or not public.is_member(s.relationship_id) then
    return null;
  end if;
  select jsonb_build_object(
           'item_id', i.id, 'status', i.status, 'position', i.position, 'round', i.round,
           'slot', i.slot, 'planned_minutes', i.planned_minutes,
           'activity', to_jsonb(a) - 'is_active' - 'created_at')
    into cur
    from public.play_session_items i join public.play_activities a on a.id = i.activity_id
   where i.id = s.current_item_id;
  if s.mode = 'planned' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'item_id', i.id, 'slot', i.slot, 'planned_minutes', i.planned_minutes, 'status', i.status,
             'is_current', i.id = s.current_item_id,
             'activity', jsonb_build_object('id', a.id, 'title', a.title, 'category', a.category, 'minutes', a.minutes))
             order by i.position), '[]'::jsonb)
      into plan
      from public.play_session_items i join public.play_activities a on a.id = i.activity_id
     where i.session_id = s.id and i.slot is not null and i.position >= coalesce(s.plan_start_position, 0);
  end if;
  return jsonb_build_object(
    'session_id', s.id,
    'started_by', s.started_by,
    'started_at', s.started_at,
    'ended_at', s.ended_at,
    'round', s.round,
    'mode', s.mode,
    'planned_minutes', s.planned_minutes,
    'plan', plan,
    'filters', s.filters,
    'current', cur,
    'played_count', (select count(*) from public.play_session_items where session_id = s.id and status <> 'planned'),
    'timer', jsonb_build_object('duration_s', s.timer_duration_s, 'ends_at', s.timer_ends_at, 'remaining_s', s.timer_remaining_s),
    'server_now', now(),
    'updated_at', s.updated_at
  );
end;
$$;

-- ------------------------------------------------------------ RPCs

-- Build (or rebuild) the call plan for the couple's open session.
create or replace function public.generate_call_plan(p_total int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sid   uuid := public.start_play_session();   -- validates sign-in + active space, opens/joins the session
  s     public.play_sessions%rowtype;
  slot_row record;
  act   uuid;
  pos   int;
  first_item uuid;
  first_minutes int;
  new_item uuid;
begin
  if p_total not in (15, 30, 45, 60, 90) then
    raise exception 'Choose 15, 30, 45, 60 or 90 minutes.' using errcode = '22023';
  end if;
  select * into s from public.play_sessions where id = sid for update;

  -- Replace any previous plan steps that weren't reached.
  delete from public.play_session_items where session_id = s.id and status = 'planned';

  select coalesce(max(position), 0) into pos from public.play_session_items where session_id = s.id;
  for slot_row in select * from public.call_plan_slots(p_total) loop
    act := public.pick_for_slot(s.id, s.round, slot_row.slot, slot_row.minutes);
    if exists (select 1 from public.play_session_items where session_id = s.id and round = s.round and activity_id = act) then
      s.round := s.round + 1;   -- pool exhausted for this slot: new round so it can repeat
    end if;
    pos := pos + 1;
    insert into public.play_session_items (session_id, activity_id, round, position, status, slot, planned_minutes, drawn_by)
    values (s.id, act, s.round, pos, 'planned', slot_row.slot, slot_row.minutes, auth.uid())
    returning id into new_item;
    if first_item is null then first_item := new_item; first_minutes := slot_row.minutes; end if;
  end loop;

  update public.play_session_items set status = 'shown' where id = first_item;
  update public.play_sessions
     set mode = 'planned', planned_minutes = p_total, round = s.round, current_item_id = first_item,
         plan_start_position = (select position from public.play_session_items where id = first_item),
         timer_duration_s = first_minutes * 60, timer_ends_at = null, timer_remaining_s = first_minutes * 60
   where id = s.id;
  return public.play_state(s.id);
end;
$$;

-- Finish the current step ('done' or 'skipped') and move to the next one.
create or replace function public.advance_call_plan(p_session uuid, p_result text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s    public.play_sessions%rowtype;
  nxt  public.play_session_items%rowtype;
begin
  if p_result not in ('done', 'skipped') then
    raise exception 'Unknown result.' using errcode = '22023';
  end if;
  select * into s from public.play_sessions where id = p_session for update;
  if not found or not public.is_member(s.relationship_id) or s.ended_at is not null then
    raise exception 'That play session isn''t available.' using errcode = 'P0001';
  end if;
  if s.mode <> 'planned' then
    raise exception 'There''s no call plan running.' using errcode = 'P0001';
  end if;

  update public.play_session_items set status = p_result
   where id = s.current_item_id and status = 'shown';

  select * into nxt from public.play_session_items
   where session_id = s.id and status = 'planned'
   order by position limit 1;

  if found then
    update public.play_session_items set status = 'shown' where id = nxt.id;
    update public.play_sessions
       set current_item_id = nxt.id,
           timer_duration_s = nxt.planned_minutes * 60, timer_ends_at = null, timer_remaining_s = nxt.planned_minutes * 60
     where id = s.id;
  else
    update public.play_sessions set current_item_id = null, timer_ends_at = null where id = s.id;  -- plan complete
  end if;
  return public.play_state(s.id);
end;
$$;

-- Swap one step (current or upcoming) for another that suits the same slot.
create or replace function public.replace_call_plan_item(p_item uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  it  public.play_session_items%rowtype;
  s   public.play_sessions%rowtype;
  act uuid;
begin
  select i.* into it from public.play_session_items i
    join public.play_sessions ps on ps.id = i.session_id
   where i.id = p_item and public.is_member(ps.relationship_id);
  if not found then
    raise exception 'That step isn''t available.' using errcode = 'P0001';
  end if;
  select * into s from public.play_sessions where id = it.session_id for update;
  if s.ended_at is not null or it.slot is null or it.status not in ('planned', 'shown') then
    raise exception 'Only upcoming or current steps can be replaced.' using errcode = 'P0001';
  end if;

  select a.id into act
    from public.play_activities a
   where a.is_active and a.minutes <= it.planned_minutes and a.id <> it.activity_id
     and not exists (select 1 from public.play_session_items i
                      where i.session_id = s.id and i.round = it.round and i.activity_id = a.id)
   order by (not public.slot_fits(a, it.slot)), a.minutes desc, random()
   limit 1;
  if act is null then
    raise exception 'No other activity fits that step right now.' using errcode = 'P0001';
  end if;

  update public.play_session_items set activity_id = act where id = it.id;
  if it.id = s.current_item_id then
    update public.play_sessions
       set timer_ends_at = null, timer_remaining_s = it.planned_minutes * 60, timer_duration_s = it.planned_minutes * 60
     where id = s.id;
  else
    update public.play_sessions set updated_at = now() where id = s.id;
  end if;
  return public.play_state(s.id);
end;
$$;

-- A normal draw now also handles leaving a plan.
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

  -- A normal draw while a call plan is running leaves the plan: steps not yet
  -- reached are removed (they never happened); done/skipped ones stay in history.
  if s.mode = 'planned' then
    delete from public.play_session_items where session_id = s.id and status = 'planned';
    update public.play_sessions set mode = 'single', planned_minutes = null where id = s.id;
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

revoke execute on function
  public.call_plan_slots(int), public.slot_fits(public.play_activities, text), public.pick_for_slot(uuid, int, text, int),
  public.generate_call_plan(int), public.advance_call_plan(uuid, text), public.replace_call_plan_item(uuid)
  from public, anon;

-- Internal helpers: Supabase's default privileges also grant new functions to
-- `authenticated`, so revoke them explicitly. (Harmless pure helpers, but the
-- app should only reach the documented RPCs.)
revoke execute on function
  public.call_plan_slots(int), public.slot_fits(public.play_activities, text), public.pick_for_slot(uuid, int, text, int),
  public.play_matches(public.play_activities, jsonb), public.clean_play_filters(jsonb), public.clean_answers(jsonb)
  from authenticated;
grant execute on function
  public.generate_call_plan(int), public.advance_call_plan(uuid, text), public.replace_call_plan_item(uuid)
  to authenticated;
