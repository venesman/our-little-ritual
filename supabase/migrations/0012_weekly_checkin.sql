-- =====================================================================
-- Our Little Ritual — Weekly Check-in (approved by Vee, 15 Nov 2026)
--
-- Optional, gentle, private until both have shared. Three core questions
-- every week, up to three mood words, one rotating bonus prompt, and a
-- "let's talk about this on a call" tick box. Same week as the rituals
-- (Monday 12:00 UTC). No scores, streaks, percentages or charts.
-- =====================================================================

create table public.checkin_prompts (
  code       int primary key,
  text       text not null check (char_length(text) between 1 and 200),
  is_active  boolean not null default true
);

insert into public.checkin_prompts (code, text) values
  (1,  'What made you smile this week?'),
  (2,  'Is there anything you wish I understood?'),
  (3,  'What''s one thing you''re looking forward to?'),
  (4,  'What was the hardest part of your week?'),
  (5,  'When did you feel closest to me this week?'),
  (6,  'What''s taking up most of your mind right now?'),
  (7,  'Something I did this week that you appreciated?'),
  (8,  'What would make next week a little easier?'),
  (9,  'What''s one small win you''re proud of?'),
  (10, 'What have you been enjoying lately?'),
  (11, 'What''s one thing you''d like us to try together soon?'),
  (12, 'Is there something you''d like to talk about on our next call?');

create table public.checkins (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  week_start       timestamptz not null,
  feeling          text not null default '' check (char_length(feeling) <= 1500),
  happy            text not null default '' check (char_length(happy) <= 1500),
  need             text not null default '' check (char_length(need) <= 1500),
  bonus_code       int references public.checkin_prompts (code),
  bonus            text not null default '' check (char_length(bonus) <= 1500),
  mood_words       text[] not null default '{}' check (cardinality(mood_words) <= 3),
  talk_on_call     boolean not null default false,
  talk_done_at     timestamptz,
  status           text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at     timestamptz,
  updated_at       timestamptz not null default now(),
  unique (relationship_id, user_id, week_start)
);
create index checkins_rel_week_idx on public.checkins (relationship_id, week_start desc);

-- The bonus prompt rotates by week, so both of you always get the same one.
create or replace function public.checkin_bonus_code(p_week timestamptz)
returns int language sql stable set search_path = '' as $$
  select code from public.checkin_prompts where is_active order by code
  offset (floor(extract(epoch from p_week) / 604800)::bigint
          % greatest((select count(*) from public.checkin_prompts where is_active), 1))
  limit 1;
$$;

-- Both shared for that week?
create or replace function public.checkin_revealed(p_rel uuid, p_week timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_member(p_rel)
     and (select count(*) from public.checkins c
           where c.relationship_id = p_rel and c.week_start = p_week and c.status = 'submitted') >= 2;
$$;

-- A week that can be answered: a real Monday 12:00 UTC boundary, not in the
-- future, and not before the space existed. Returns the relationship id.
create or replace function public.checkin_check_week(p_week timestamptz)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
  r   public.relationships%rowtype;
begin
  select * into r from public.relationships where id = rel;
  if not found or r.status <> 'active' then
    raise exception 'Check-ins open once your partner has joined.' using errcode = 'P0001';
  end if;
  if p_week is null or p_week <> public.ritual_week_start(p_week) then
    raise exception 'That isn''t a check-in week.' using errcode = '22023';
  end if;
  if p_week > public.ritual_week_start(now()) then
    raise exception 'That week hasn''t started yet.' using errcode = 'P0001';
  end if;
  if p_week < public.ritual_week_start(r.created_at) then
    raise exception 'That week is before your space began.' using errcode = 'P0001';
  end if;
  return rel;
end;
$$;

create or replace function public.checkin_row_json(c public.checkins)
returns jsonb language sql stable set search_path = '' as $$
  select case when c.id is null then null else jsonb_build_object(
    'user_id', c.user_id, 'feeling', c.feeling, 'happy', c.happy, 'need', c.need,
    'bonus_code', c.bonus_code, 'bonus', c.bonus, 'mood_words', to_jsonb(c.mood_words),
    'talk_on_call', c.talk_on_call, 'talk_done_at', c.talk_done_at,
    'status', c.status, 'submitted_at', c.submitted_at, 'updated_at', c.updated_at) end;
$$;

-- Everything the check-in screen needs for one week. Your partner's answers are
-- included only once both of you have shared.
create or replace function public.checkin_week(p_week timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  wk   timestamptz := coalesce(p_week, public.ritual_week_start(now()));
  rel  uuid := public.checkin_check_week(wk);
  mine public.checkins%rowtype;
  them public.checkins%rowtype;
  open_ boolean;
  bc   int := public.checkin_bonus_code(wk);
begin
  select * into mine from public.checkins where relationship_id = rel and week_start = wk and user_id = auth.uid();
  select * into them from public.checkins where relationship_id = rel and week_start = wk and user_id <> auth.uid();
  open_ := coalesce(mine.status = 'submitted' and them.status = 'submitted', false);
  return jsonb_build_object(
    'week_start', wk,
    'next_release', wk + interval '7 days',
    'is_current', wk = public.ritual_week_start(now()),
    'bonus', (select jsonb_build_object('code', p.code, 'text', p.text) from public.checkin_prompts p
               where p.code = coalesce(mine.bonus_code, bc)),
    'mine', public.checkin_row_json(mine),
    'partner_submitted', coalesce(them.status = 'submitted', false),
    'revealed', open_,
    'partner', case when open_ then public.checkin_row_json(them) else null end,
    -- The tick box is a choice the person shares with the check-in, so it shows once they've shared.
    'partner_wants_to_talk', coalesce(them.status = 'submitted' and them.talk_on_call and them.talk_done_at is null, false));
end;
$$;

-- Save (draft) or share (submit) your check-in. Every field is optional, but a
-- shared check-in needs at least one answer or mood word.
create or replace function public.save_checkin(
  p_week timestamptz, p_feeling text default '', p_happy text default '', p_need text default '',
  p_bonus text default '', p_mood_words text[] default '{}', p_talk_on_call boolean default false, p_submit boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  rel   uuid := public.checkin_check_week(p_week);
  cur   public.checkins%rowtype;
  words text[] := '{}';
  w     text;
  allowed text[] := array['calm', 'happy', 'tired', 'stressed', 'excited', 'homesick', 'grateful', 'lonely',
                          'hopeful', 'busy', 'proud', 'overwhelmed', 'content', 'missing you'];
  f text := trim(coalesce(p_feeling, ''));
  h text := trim(coalesce(p_happy, ''));
  n text := trim(coalesce(p_need, ''));
  b text := trim(coalesce(p_bonus, ''));
begin
  perform 1 from public.relationships where id = rel for update;   -- one writer at a time per couple
  select * into cur from public.checkins where relationship_id = rel and week_start = p_week and user_id = auth.uid();
  if found and cur.status = 'submitted' then
    raise exception 'You''ve already shared this check-in.' using errcode = 'P0001';
  end if;
  if greatest(char_length(f), char_length(h), char_length(n), char_length(b)) > 1500 then
    raise exception 'Please keep each answer under 1,500 characters.' using errcode = '22001';
  end if;
  foreach w in array coalesce(p_mood_words, '{}') loop
    w := lower(trim(w));
    if not w = any (allowed) then
      raise exception 'Please choose mood words from the list.' using errcode = '22023';
    end if;
    if not w = any (words) then words := words || w; end if;
  end loop;
  if cardinality(words) > 3 then
    raise exception 'Pick up to three mood words.' using errcode = '22023';
  end if;
  if p_submit and f = '' and h = '' and n = '' and b = '' and cardinality(words) = 0 then
    raise exception 'Add an answer or a mood word before sharing — or skip this week, that''s fine too.' using errcode = 'P0001';
  end if;

  insert into public.checkins (relationship_id, user_id, week_start, feeling, happy, need, bonus_code, bonus, mood_words,
                               talk_on_call, status, submitted_at)
  values (rel, auth.uid(), p_week, f, h, n, public.checkin_bonus_code(p_week), b, words, coalesce(p_talk_on_call, false),
          case when p_submit then 'submitted' else 'draft' end, case when p_submit then now() end)
  on conflict (relationship_id, user_id, week_start) do update set
    feeling = excluded.feeling, happy = excluded.happy, need = excluded.need, bonus = excluded.bonus,
    mood_words = excluded.mood_words, talk_on_call = excluded.talk_on_call, status = excluded.status,
    submitted_at = excluded.submitted_at, updated_at = now();
  return public.checkin_week(p_week);
end;
$$;

-- "We talked about it": clears the call reminder for that week, for both of you.
create or replace function public.mark_checkin_talked(p_week timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare rel uuid := public.checkin_check_week(p_week);
begin
  update public.checkins set talk_done_at = now()
   where relationship_id = rel and week_start = p_week and talk_on_call and status = 'submitted' and talk_done_at is null;
  return public.checkin_week(p_week);
end;
$$;

-- Your check-in history: status only (no partner content unless revealed — read
-- answers through checkin_week or the table, which RLS protects).
create or replace function public.my_checkin_weeks()
returns table (week_start timestamptz, my_status text, partner_submitted boolean, revealed boolean, talk_pending boolean)
language sql stable security definer set search_path = '' as $$
  with weeks as (
    select distinct c.week_start from public.checkins c where c.relationship_id = public.my_relationship_id()
    union select public.ritual_week_start(now()) where public.my_relationship_id() is not null
  )
  select w.week_start,
         coalesce(mine.status, 'none'),
         coalesce(them.status = 'submitted', false),
         coalesce(mine.status = 'submitted' and them.status = 'submitted', false),
         exists (select 1 from public.checkins c where c.relationship_id = public.my_relationship_id() and c.week_start = w.week_start
                   and c.status = 'submitted' and c.talk_on_call and c.talk_done_at is null)
    from weeks w
    left join public.checkins mine on mine.relationship_id = public.my_relationship_id() and mine.week_start = w.week_start and mine.user_id = auth.uid()
    left join public.checkins them on them.relationship_id = public.my_relationship_id() and them.week_start = w.week_start and them.user_id <> auth.uid()
   order by w.week_start desc
   limit 104;
$$;

-- ------------------------------------------------------------------- RLS
alter table public.checkin_prompts enable row level security;
alter table public.checkins        enable row level security;

create policy "checkin prompts: signed-in read" on public.checkin_prompts for select to authenticated using (true);
create policy "checkins: own, or partner's once both shared" on public.checkins
  for select to authenticated
  using (user_id = auth.uid() or (status = 'submitted' and public.checkin_revealed(relationship_id, week_start)));

revoke all on public.checkin_prompts, public.checkins from anon, authenticated;
grant select on public.checkin_prompts, public.checkins to authenticated;

revoke execute on function
  public.checkin_bonus_code(timestamptz), public.checkin_revealed(uuid, timestamptz), public.checkin_check_week(timestamptz),
  public.checkin_row_json(public.checkins), public.checkin_week(timestamptz),
  public.save_checkin(timestamptz, text, text, text, text, text[], boolean, boolean),
  public.mark_checkin_talked(timestamptz), public.my_checkin_weeks()
  from public, anon, authenticated;
grant execute on function
  public.checkin_revealed(uuid, timestamptz), public.checkin_week(timestamptz),
  public.save_checkin(timestamptz, text, text, text, text, text[], boolean, boolean),
  public.mark_checkin_talked(timestamptz), public.my_checkin_weeks()
  to authenticated;
