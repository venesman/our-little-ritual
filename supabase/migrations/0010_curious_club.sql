-- =====================================================================
-- Our Little Ritual — The Curious Club
-- "Two curious minds. One little topic. Two different perspectives."
--
-- A live research date on a call: pick a topic → choose a format → research
-- on your own → each present for a minute → discuss → save discoveries.
-- One open session per couple; both phones follow the same stage and timer.
--
-- Rules enforced here:
--   * your research notes stay private until presentations start
--   * Fact or Fiction claims are never answered by the app
--   * source links must be https; no citations are generated
--   * place-specific topics appear only under "Just us", and only when one of
--     you lives in or comes from that country (from Our Story profiles)
-- Nothing here touches the Monday weekly ritual.
-- =====================================================================

create table public.curious_topics (
  id                uuid primary key default gen_random_uuid(),
  code              int not null unique,
  title             text not null,
  area              text not null check (area in ('psychology', 'science', 'culture', 'philosophy', 'technology',
                                                  'art', 'nature', 'money', 'history', 'geography')),
  intro_question    text not null,
  explore           text not null,
  angles            text[] not null default '{}',
  research_minutes  int not null check (research_minutes in (5, 10, 15)),
  difficulty        text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  debate_statement  text,
  claims            text[] not null default '{}',
  split_a           text,
  split_b           text,
  countries         text[] not null default '{}',   -- lower-case country names this topic is about
  just_us           boolean not null default false,  -- personal topic with [tokens]
  needs             text[] not null default '{}',
  fallback_explore  text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  check ((split_a is null) = (split_b is null))
);

create table public.curious_sessions (
  id                 uuid primary key default gen_random_uuid(),
  relationship_id    uuid not null references public.relationships (id) on delete cascade,
  topic_id           uuid not null references public.curious_topics (id) on delete restrict,
  format             text not null default 'teach'
                     check (format in ('teach', 'perspectives', 'debate', 'fact_fiction', 'deep_dive', 'expert')),
  research_minutes   int not null default 10 check (research_minutes in (5, 10, 15)),
  present_seconds    int not null default 60 check (present_seconds in (30, 60, 120)),
  stage              text not null default 'setup' check (stage in ('setup', 'research', 'present', 'discuss')),
  first_presenter    uuid references auth.users (id) on delete set null,
  presenter_index    int not null default 0 check (presenter_index in (0, 1)),
  timer_duration_s   int,
  timer_ends_at      timestamptz,
  timer_remaining_s  int,
  started_by         uuid references auth.users (id) on delete set null,
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  updated_at         timestamptz not null default now()
);
create unique index curious_one_open_per_couple on public.curious_sessions (relationship_id) where ended_at is null;
create index curious_sessions_rel_idx on public.curious_sessions (relationship_id, started_at desc);

create table public.curious_notes (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.curious_sessions (id) on delete cascade,
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  summary          text not null default '' check (char_length(summary) <= 1500),
  links            text[] not null default '{}',
  verdicts         jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now(),
  unique (session_id, user_id)
);

create table public.curious_discoveries (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  session_id       uuid references public.curious_sessions (id) on delete set null,
  topic_id         uuid references public.curious_topics (id) on delete set null,
  user_id          uuid not null references auth.users (id) on delete cascade,
  body             text not null check (char_length(body) between 1 and 500),
  created_at       timestamptz not null default now()
);
create index curious_discoveries_rel_idx on public.curious_discoveries (relationship_id, created_at desc);

create table public.curious_favourites (
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  topic_id         uuid not null references public.curious_topics (id) on delete cascade,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  primary key (relationship_id, topic_id)
);

-- ------------------------------------------------------------ helpers

-- Countries the couple lives in or comes from (lower-case), from Our Story.
create or replace function public.curious_countries(p_rel uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct lower(trim(c))) filter (where c is not null and trim(c) <> ''), '{}')
    from public.relationship_members m
    join public.profiles p on p.id = m.user_id
    cross join lateral unnest(array[p.current_country, p.home_country]) c
   where m.relationship_id = p_rel and m.status = 'active';
$$;

create or replace function public.curious_supports(t public.curious_topics, p_format text)
returns boolean language sql immutable set search_path = '' as $$
  select case p_format
    when 'debate'       then t.debate_statement is not null
    when 'fact_fiction' then cardinality(t.claims) > 0
    when 'deep_dive'    then t.split_a is not null
    when 'teach'        then true
    when 'perspectives' then true
    when 'expert'       then true
    else false end;
$$;

create or replace function public.clean_curious_filters(f jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare out jsonb := '{}'::jsonb;
begin
  if f is null or jsonb_typeof(f) <> 'object' then return out; end if;
  if (f ->> 'area') in ('psychology', 'science', 'culture', 'philosophy', 'technology', 'art', 'nature', 'money', 'history', 'geography') then
    out := out || jsonb_build_object('area', f ->> 'area');
  end if;
  if (f ->> 'difficulty') in ('beginner', 'intermediate', 'advanced') then
    out := out || jsonb_build_object('difficulty', f ->> 'difficulty');
  end if;
  if (f ->> 'format') in ('teach', 'perspectives', 'debate', 'fact_fiction', 'deep_dive', 'expert') then
    out := out || jsonb_build_object('format', f ->> 'format');
  end if;
  if (f ->> 'just_us') = 'true' then
    out := out || jsonb_build_object('just_us', true);
  end if;
  return out;
end;
$$;

-- General draws: general topics only. Just us draws: personal topics, plus place
-- topics about a country one of you lives in or comes from.
create or replace function public.curious_matches(t public.curious_topics, f jsonb, p_countries text[])
returns boolean language sql immutable set search_path = '' as $$
  select t.is_active
     and case when coalesce((f ->> 'just_us')::boolean, false)
              then t.just_us or (cardinality(t.countries) > 0 and t.countries && p_countries)
              else not t.just_us and cardinality(t.countries) = 0 end
     and (f ->> 'area' is null or t.area = f ->> 'area')
     and (f ->> 'difficulty' is null or t.difficulty = f ->> 'difficulty')
     and (f ->> 'format' is null or public.curious_supports(t, f ->> 'format'));
$$;

-- Partner notes open once presentations start (or the session is over).
create or replace function public.curious_notes_visible(p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.curious_sessions s
                  where s.id = p_session and public.is_member(s.relationship_id)
                    and (s.ended_at is not null or s.stage in ('present', 'discuss')));
$$;

create or replace function public.curious_state(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.curious_sessions%rowtype;
  open_notes boolean;
begin
  select * into s from public.curious_sessions where id = p_session;
  if not found or not public.is_member(s.relationship_id) then return null; end if;
  open_notes := s.ended_at is not null or s.stage in ('present', 'discuss');
  return jsonb_build_object(
    'session_id', s.id, 'stage', s.stage, 'format', s.format,
    'research_minutes', s.research_minutes, 'present_seconds', s.present_seconds,
    'first_presenter', s.first_presenter, 'presenter_index', s.presenter_index,
    'started_by', s.started_by, 'started_at', s.started_at, 'ended_at', s.ended_at,
    'topic', (select to_jsonb(t) - 'is_active' - 'created_at' from public.curious_topics t where t.id = s.topic_id),
    'favourite', exists (select 1 from public.curious_favourites f where f.relationship_id = s.relationship_id and f.topic_id = s.topic_id),
    'timer', jsonb_build_object('duration_s', s.timer_duration_s, 'ends_at', s.timer_ends_at, 'remaining_s', s.timer_remaining_s),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('user_id', n.user_id, 'summary', n.summary, 'links', n.links,
                                                           'verdicts', n.verdicts, 'updated_at', n.updated_at) order by n.updated_at)
                         from public.curious_notes n
                        where n.session_id = s.id and (n.user_id = auth.uid() or open_notes)), '[]'::jsonb),
    'partner_has_notes', exists (select 1 from public.curious_notes n
                                  where n.session_id = s.id and n.user_id <> auth.uid() and (n.summary <> '' or cardinality(n.links) > 0 or n.verdicts <> '{}'::jsonb)),
    'discoveries', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'user_id', d.user_id, 'body', d.body, 'created_at', d.created_at) order by d.created_at)
                               from public.curious_discoveries d where d.session_id = s.id), '[]'::jsonb),
    'server_now', now(), 'updated_at', s.updated_at);
end;
$$;

create or replace function public.current_curious_state()
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.curious_state(s.id) from public.curious_sessions s
   where s.relationship_id = public.my_relationship_id() and s.ended_at is null limit 1;
$$;

-- Locks and returns an open session of the caller's couple.
create or replace function public.curious_lock(p_session uuid)
returns public.curious_sessions language plpgsql volatile security definer set search_path = '' as $$
declare s public.curious_sessions%rowtype;
begin
  select * into s from public.curious_sessions where id = p_session for update;
  if not found or not public.is_member(s.relationship_id) then
    raise exception 'That session isn''t available.' using errcode = 'P0001';
  end if;
  if s.ended_at is not null then
    raise exception 'That session has ended.' using errcode = 'P0001';
  end if;
  return s;
end;
$$;

-- ---------------------------------------------------------------- actions

create or replace function public.start_curious(p_filters jsonb default '{}'::jsonb, p_topic uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rel uuid := public.my_relationship_id();
  f   jsonb := public.clean_curious_filters(p_filters);
  cs  text[];
  t   public.curious_topics%rowtype;
  s   public.curious_sessions%rowtype;
begin
  if uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  perform 1 from public.relationships r where r.id = rel and r.status = 'active' for update;
  if not found then
    raise exception 'The Curious Club opens once your partner has joined.' using errcode = 'P0001';
  end if;
  cs := public.curious_countries(rel);

  if p_topic is not null then
    select * into t from public.curious_topics x where x.id = p_topic and x.is_active;
    if not found then
      raise exception 'That topic isn''t available.' using errcode = 'P0001';
    end if;
  else
    if not exists (select 1 from public.curious_topics x where public.curious_matches(x, f, cs)) then
      raise exception 'No topics match all of those filters. Try removing one.' using errcode = 'P0001';
    end if;
    -- Prefer topics you haven't explored yet (and not the one on screen).
    select x.* into t from public.curious_topics x
     where public.curious_matches(x, f, cs)
     order by exists (select 1 from public.curious_sessions o where o.relationship_id = rel and o.topic_id = x.id), random()
     limit 1;
  end if;

  select * into s from public.curious_sessions where relationship_id = rel and ended_at is null for update;
  if found then
    if s.stage <> 'setup' then
      raise exception 'You already have a Curious Club session going — finish it first.' using errcode = 'P0001';
    end if;
    update public.curious_sessions
       set topic_id = t.id,
           format = case when public.curious_supports(t, coalesce(f ->> 'format', s.format)) then coalesce(f ->> 'format', s.format) else 'teach' end,
           research_minutes = t.research_minutes, updated_at = now()
     where id = s.id;
  else
    insert into public.curious_sessions (relationship_id, topic_id, format, research_minutes, started_by, first_presenter)
    values (rel, t.id,
            case when public.curious_supports(t, coalesce(f ->> 'format', 'teach')) then coalesce(f ->> 'format', 'teach') else 'teach' end,
            t.research_minutes, uid, uid)
    returning * into s;
  end if;
  return public.curious_state(s.id);
end;
$$;

create or replace function public.curious_setup(p_session uuid, p_format text, p_research_minutes int, p_present_seconds int, p_first_presenter uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.curious_sessions := public.curious_lock(p_session);
  t public.curious_topics%rowtype;
begin
  if s.stage <> 'setup' then
    raise exception 'Settings can be changed before research starts.' using errcode = 'P0001';
  end if;
  select * into t from public.curious_topics where id = s.topic_id;
  if not public.curious_supports(t, p_format) then
    raise exception 'That format doesn''t fit this topic.' using errcode = '22023';
  end if;
  if p_research_minutes not in (5, 10, 15) or p_present_seconds not in (30, 60, 120) then
    raise exception 'Please pick 5, 10 or 15 minutes and 30, 60 or 120 seconds.' using errcode = '22023';
  end if;
  if p_first_presenter is null or not exists (select 1 from public.relationship_members m
                                               where m.relationship_id = s.relationship_id and m.user_id = p_first_presenter and m.status = 'active') then
    raise exception 'The first presenter must be one of you.' using errcode = '22023';
  end if;
  update public.curious_sessions
     set format = p_format, research_minutes = p_research_minutes, present_seconds = p_present_seconds,
         first_presenter = p_first_presenter, updated_at = now()
   where id = s.id;
  return public.curious_state(s.id);
end;
$$;

create or replace function public.curious_swap_order(p_session uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.curious_sessions := public.curious_lock(p_session);
  other uuid;
begin
  if s.stage = 'discuss' or (s.stage = 'present' and s.presenter_index = 1) then
    raise exception 'Both of you have started presenting already.' using errcode = 'P0001';
  end if;
  select m.user_id into other from public.relationship_members m
   where m.relationship_id = s.relationship_id and m.status = 'active' and m.user_id is distinct from s.first_presenter
   limit 1;
  update public.curious_sessions set first_presenter = coalesce(other, first_presenter), updated_at = now() where id = s.id;
  return public.curious_state(s.id);
end;
$$;

-- Move to the next step. p_from_stage / p_from_index must match the screen the
-- tap came from, so two quick taps (or both phones at once) only move one step.
create or replace function public.curious_advance(p_session uuid, p_from_stage text, p_from_index int default 0)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s public.curious_sessions := public.curious_lock(p_session);
begin
  if s.stage <> p_from_stage or (s.stage = 'present' and s.presenter_index <> coalesce(p_from_index, 0)) then
    return public.curious_state(s.id);   -- the other phone already moved on
  end if;
  if s.stage = 'setup' then
    update public.curious_sessions set stage = 'research', presenter_index = 0,
           timer_duration_s = research_minutes * 60, timer_ends_at = now() + make_interval(mins => research_minutes),
           timer_remaining_s = null, updated_at = now()
     where id = s.id;
  elsif s.stage = 'research' then
    update public.curious_sessions set stage = 'present', presenter_index = 0,
           timer_duration_s = present_seconds, timer_ends_at = null, timer_remaining_s = present_seconds, updated_at = now()
     where id = s.id;
  elsif s.stage = 'present' and s.presenter_index = 0 then
    update public.curious_sessions set presenter_index = 1,
           timer_duration_s = present_seconds, timer_ends_at = null, timer_remaining_s = present_seconds, updated_at = now()
     where id = s.id;
  elsif s.stage = 'present' then
    update public.curious_sessions set stage = 'discuss', timer_duration_s = null, timer_ends_at = null, timer_remaining_s = null, updated_at = now()
     where id = s.id;
  else
    update public.curious_sessions set ended_at = now(), timer_ends_at = null, updated_at = now() where id = s.id;
  end if;
  return public.curious_state(s.id);
end;
$$;

create or replace function public.curious_timer(p_session uuid, p_action text, p_duration_s int default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.curious_sessions := public.curious_lock(p_session);
  left_s int;
begin
  if s.stage not in ('research', 'present') then
    raise exception 'There''s no timer at this step.' using errcode = 'P0001';
  end if;
  if p_duration_s is not null and p_duration_s not in (30, 60, 120, 300, 600, 900) then
    raise exception 'Unsupported timer length.' using errcode = '22023';
  end if;
  left_s := case when s.timer_ends_at is not null then greatest(0, ceil(extract(epoch from (s.timer_ends_at - now())))::int)
                 else coalesce(s.timer_remaining_s, s.timer_duration_s, 0) end;
  if p_action = 'start' then
    if s.timer_ends_at is null and left_s > 0 then
      update public.curious_sessions set timer_ends_at = now() + make_interval(secs => left_s), timer_remaining_s = null, updated_at = now() where id = s.id;
    end if;
  elsif p_action = 'pause' then
    update public.curious_sessions set timer_ends_at = null, timer_remaining_s = left_s, updated_at = now() where id = s.id;
  elsif p_action = 'reset' then
    update public.curious_sessions
       set timer_duration_s = coalesce(p_duration_s, timer_duration_s), timer_ends_at = null,
           timer_remaining_s = coalesce(p_duration_s, timer_duration_s), updated_at = now()
     where id = s.id;
  elsif p_action = 'skip' then
    update public.curious_sessions set timer_ends_at = null, timer_remaining_s = 0, updated_at = now() where id = s.id;
  else
    raise exception 'Unknown timer action.' using errcode = '22023';
  end if;
  return public.curious_state(s.id);
end;
$$;

create or replace function public.save_curious_note(p_session uuid, p_summary text default '', p_links jsonb default '[]'::jsonb, p_verdicts jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s     public.curious_sessions := public.curious_lock(p_session);
  t     public.curious_topics%rowtype;
  links text[] := '{}';
  l     text;
  v     jsonb := '{}'::jsonb;
  k     text;
  val   text;
  b     text := trim(coalesce(p_summary, ''));
begin
  if char_length(b) > 1500 then
    raise exception 'Please keep your notes under 1,500 characters.' using errcode = '22001';
  end if;
  if p_links is not null and jsonb_typeof(p_links) = 'array' then
    for l in select trim(x) from jsonb_array_elements_text(p_links) x loop
      continue when l = '';
      if l !~ '^https://[^\s]+$' or char_length(l) > 500 then
        raise exception 'Source links need to start with https://' using errcode = '22023';
      end if;
      if not l = any (links) then links := links || l; end if;
    end loop;
  end if;
  if cardinality(links) > 5 then
    raise exception 'Up to five source links, please.' using errcode = '22023';
  end if;
  select * into t from public.curious_topics where id = s.topic_id;
  if p_verdicts is not null and jsonb_typeof(p_verdicts) = 'object' then
    for k, val in select key, value #>> '{}' from jsonb_each(p_verdicts) loop
      if k ~ '^[0-9]{1,2}$' and k::int < cardinality(t.claims) and val in ('true', 'false', 'misleading') then
        v := v || jsonb_build_object(k, val);
      end if;
    end loop;
  end if;
  insert into public.curious_notes (session_id, relationship_id, user_id, summary, links, verdicts)
  values (s.id, s.relationship_id, auth.uid(), b, links, v)
  on conflict (session_id, user_id) do update set summary = excluded.summary, links = excluded.links, verdicts = excluded.verdicts, updated_at = now();
  update public.curious_sessions set updated_at = now() where id = s.id;   -- lets the other phone know
  return public.curious_state(s.id);
end;
$$;

create or replace function public.add_curious_discovery(p_session uuid, p_body text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.curious_sessions%rowtype;
  b text := trim(coalesce(p_body, ''));
begin
  select * into s from public.curious_sessions where id = p_session for update;
  if not found or not public.is_member(s.relationship_id) then
    raise exception 'That session isn''t available.' using errcode = 'P0001';
  end if;
  if char_length(b) < 1 or char_length(b) > 500 then
    raise exception 'Discoveries can be 1 to 500 characters.' using errcode = '22023';
  end if;
  if (select count(*) from public.curious_discoveries where session_id = s.id) >= 40 then
    raise exception 'That''s plenty for one session!' using errcode = 'P0001';
  end if;
  insert into public.curious_discoveries (relationship_id, session_id, topic_id, user_id, body)
  values (s.relationship_id, s.id, s.topic_id, auth.uid(), b);
  update public.curious_sessions set updated_at = now() where id = s.id;
  return public.curious_state(s.id);
end;
$$;

create or replace function public.delete_curious_discovery(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  delete from public.curious_discoveries where id = p_id and user_id = auth.uid() returning session_id into sid;
  if not found then
    raise exception 'You can only remove your own discoveries.' using errcode = 'P0001';
  end if;
  update public.curious_sessions set updated_at = now() where id = sid;
end;
$$;

create or replace function public.toggle_curious_favourite(p_topic uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare rel uuid := public.my_relationship_id();
begin
  if rel is null then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.curious_topics where id = p_topic and is_active) then
    raise exception 'That topic isn''t available.' using errcode = 'P0001';
  end if;
  delete from public.curious_favourites where relationship_id = rel and topic_id = p_topic;
  if found then
    update public.curious_sessions set updated_at = now() where relationship_id = rel and ended_at is null;
    return false;
  end if;
  insert into public.curious_favourites (relationship_id, topic_id, created_by) values (rel, p_topic, auth.uid());
  update public.curious_sessions set updated_at = now() where relationship_id = rel and ended_at is null;
  return true;
end;
$$;

create or replace function public.end_curious(p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.curious_sessions%rowtype;
begin
  select * into s from public.curious_sessions where id = p_session for update;
  if not found or not public.is_member(s.relationship_id) then
    raise exception 'That session isn''t available.' using errcode = 'P0001';
  end if;
  if s.ended_at is not null then return; end if;
  -- A session that never got past choosing a topic leaves no trace in history.
  if s.stage = 'setup' and not exists (select 1 from public.curious_discoveries d where d.session_id = s.id) then
    delete from public.curious_sessions where id = s.id;
  else
    update public.curious_sessions set ended_at = now(), timer_ends_at = null, updated_at = now() where id = s.id;
  end if;
end;
$$;

-- ------------------------------------------------------------------- RLS
alter table public.curious_topics      enable row level security;
alter table public.curious_sessions    enable row level security;
alter table public.curious_notes       enable row level security;
alter table public.curious_discoveries enable row level security;
alter table public.curious_favourites  enable row level security;

create policy "curious topics: signed-in read" on public.curious_topics for select to authenticated using (true);
create policy "curious sessions: members read" on public.curious_sessions for select to authenticated using (public.is_member(relationship_id));
create policy "curious notes: own, or partner's once presenting" on public.curious_notes
  for select to authenticated using (user_id = auth.uid() or public.curious_notes_visible(session_id));
create policy "curious discoveries: members read" on public.curious_discoveries for select to authenticated using (public.is_member(relationship_id));
create policy "curious favourites: members read" on public.curious_favourites for select to authenticated using (public.is_member(relationship_id));

revoke all on public.curious_topics, public.curious_sessions, public.curious_notes, public.curious_discoveries, public.curious_favourites from anon, authenticated;
grant select on public.curious_topics, public.curious_sessions, public.curious_notes, public.curious_discoveries, public.curious_favourites to authenticated;

revoke execute on function
  public.curious_countries(uuid), public.curious_supports(public.curious_topics, text), public.clean_curious_filters(jsonb),
  public.curious_matches(public.curious_topics, jsonb, text[]), public.curious_notes_visible(uuid), public.curious_state(uuid),
  public.current_curious_state(), public.curious_lock(uuid), public.start_curious(jsonb, uuid),
  public.curious_setup(uuid, text, int, int, uuid), public.curious_swap_order(uuid), public.curious_advance(uuid, text, int),
  public.curious_timer(uuid, text, int), public.save_curious_note(uuid, text, jsonb, jsonb), public.add_curious_discovery(uuid, text),
  public.delete_curious_discovery(uuid), public.toggle_curious_favourite(uuid), public.end_curious(uuid)
  from public, anon, authenticated;
grant execute on function
  public.curious_notes_visible(uuid), public.current_curious_state(), public.start_curious(jsonb, uuid),
  public.curious_setup(uuid, text, int, int, uuid), public.curious_swap_order(uuid), public.curious_advance(uuid, text, int),
  public.curious_timer(uuid, text, int), public.save_curious_note(uuid, text, jsonb, jsonb), public.add_curious_discovery(uuid, text),
  public.delete_curious_discovery(uuid), public.toggle_curious_favourite(uuid), public.end_curious(uuid)
  to authenticated;

do $rt$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.curious_sessions; exception when duplicate_object then null; end;
  end if;
end
$rt$;
