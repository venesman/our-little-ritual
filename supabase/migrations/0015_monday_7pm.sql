-- =====================================================================
-- Our Little Ritual — Monday postcard opens one hour earlier (Vee, 15 Nov 2026)
--
-- The shared weekly boundary moves from Monday 12:00 UTC to Monday 11:00 UTC:
-- 7 pm in Kuching all year; 8 am in Santiago in Chile's summer, 7 am in winter.
-- Rituals and check-ins both use this boundary, so their existing weeks move by
-- the same hour. Nothing is deleted and week numbers stay the same.
-- =====================================================================

-- 1. The boundary itself.
create or replace function public.ritual_week_start(ts timestamptz default now())
returns timestamptz language sql immutable set search_path = '' as $$
  select case
    when (date_trunc('week', ts at time zone 'UTC') + interval '11 hours') at time zone 'UTC' <= ts
      then (date_trunc('week', ts at time zone 'UTC') + interval '11 hours') at time zone 'UTC'
    else (date_trunc('week', ts at time zone 'UTC') - interval '7 days' + interval '11 hours') at time zone 'UTC'
  end;
$$;

-- 2. Existing weeks move by the same hour (in one transaction with the rule change).
do $shift$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.weekly_activities'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%12:00%'
  loop
    execute format('alter table public.weekly_activities drop constraint %I', c);
  end loop;
end
$shift$;

update public.weekly_activities set week_start = week_start - interval '1 hour'
 where (week_start at time zone 'UTC')::time = time '12:00';
update public.checkins set week_start = week_start - interval '1 hour'
 where (week_start at time zone 'UTC')::time = time '12:00';

alter table public.weekly_activities add constraint weekly_activities_monday_release
  check (extract(isodow from week_start at time zone 'UTC') = 1 and (week_start at time zone 'UTC')::time = time '11:00');

-- 3. The weekly generator (unchanged apart from its message).
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
    raise exception 'Week must start on a Monday at 11:00 UTC.' using errcode = '22023';
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
revoke execute on function public.assign_weekly_activity(uuid, timestamptz) from public, anon, authenticated;

-- 4. The Monday scheduler (only if pg_cron is enabled; harmless otherwise).
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('olr-weekly-ritual');
    exception when others then null;
    end;
    perform cron.schedule('olr-weekly-ritual', '0 11 * * 1', 'select public.generate_weekly_rituals();');
    raise notice 'Scheduled the weekly ritual for Mondays 11:00 UTC (7 pm Kuching).';
  else
    raise notice 'pg_cron not enabled: the week''s ritual is created when either of you first opens the app.';
  end if;
end
$cron$;
