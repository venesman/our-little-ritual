-- =====================================================================
-- Our Little Ritual — Quiz Time: Quiz Duel (approved by Vee, 15 Nov 2026)
--
-- Like Quiz Planet, just for the two of you. A match is 6 rounds of 3
-- questions; you take turns picking each round's category from 3 offered,
-- then both answer the same 3 questions (multiple choice, 20 seconds each).
-- Everything that matters is decided here, not in the app:
--   • the right answer is never sent before you've answered;
--   • the timer runs on the server (re-opening a question doesn't reset it);
--   • your partner's answer to a question stays hidden until you've answered it;
--   • each match shows who won — no running tally, no leaderboard, no streaks.
-- Questions: a 300-question starter bank written for you two, an optional
-- one-time import of Open Trivia DB (CC BY-SA 4.0, credited in the app), and
-- your own questions. Either of you can report a question; it's then left out.
-- =====================================================================

create table public.quiz_categories (
  code   text primary key,
  label  text not null,
  sort   int not null
);
insert into public.quiz_categories (code, label, sort) values
  ('general', 'General knowledge', 1), ('geography', 'Geography', 2), ('science', 'Science & nature', 3),
  ('history', 'History', 4), ('food', 'Food & drink', 5), ('music', 'Music', 6), ('movies', 'Movies & TV', 7),
  ('sport', 'Sport', 8), ('words', 'Words & languages', 9), ('animals', 'Animals', 10), ('art_books', 'Art & books', 11),
  ('technology', 'Technology', 12), ('malaysia', 'Malaysia & Borneo', 13), ('sweden', 'Sweden', 14),
  ('chile', 'Chile & South America', 15), ('ours', 'Our inside jokes', 16);

create table public.quiz_questions (
  id               uuid primary key default gen_random_uuid(),
  category         text not null references public.quiz_categories (code),
  question         text not null check (char_length(question) between 5 and 400),
  correct          text not null check (char_length(correct) between 1 and 200),
  wrong            text[] not null check (array_length(wrong, 1) = 3),
  difficulty       text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  source           text not null check (source in ('starter', 'opentdb', 'ours')),
  external_key     text unique,                                   -- de-duplication for imported banks
  relationship_id  uuid references public.relationships (id) on delete cascade,   -- set for your own questions
  created_by       uuid references auth.users (id) on delete set null,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  check ((source = 'ours') = (relationship_id is not null))
);
create index quiz_questions_pick_idx on public.quiz_questions (category, active) where relationship_id is null;
create index quiz_questions_rel_idx on public.quiz_questions (relationship_id) where relationship_id is not null;

create table public.quiz_reports (
  question_id      uuid not null references public.quiz_questions (id) on delete cascade,
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  reported_by      uuid not null references auth.users (id) on delete cascade,
  reason           text not null default '' check (char_length(reason) <= 200),
  created_at       timestamptz not null default now(),
  primary key (question_id, relationship_id)
);

create table public.quiz_matches (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  started_by       uuid not null references auth.users (id) on delete cascade,
  status           text not null default 'active' check (status in ('active', 'finished', 'ended')),
  created_at       timestamptz not null default now(),
  finished_at      timestamptz,
  ended_by         uuid references auth.users (id) on delete set null
);
create unique index quiz_matches_one_active on public.quiz_matches (relationship_id) where status = 'active';

create table public.quiz_rounds (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.quiz_matches (id) on delete cascade,
  round_no      int not null check (round_no between 1 and 6),
  picker_id     uuid not null references auth.users (id) on delete cascade,
  offered       text[] not null,
  category      text references public.quiz_categories (code),
  question_ids  uuid[],
  orders        jsonb,          -- per question: the 4 options' order, as indexes into [correct, wrong1, wrong2, wrong3]
  picked_at     timestamptz,
  unique (match_id, round_no)
);

create table public.quiz_answers (
  round_id     uuid not null references public.quiz_rounds (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  q_index      int not null check (q_index between 0 and 2),
  shown_at     timestamptz not null default now(),
  answered_at  timestamptz,
  choice       int check (choice between -1 and 3),     -- position picked; -1 = time ran out
  correct      boolean,
  primary key (round_id, user_id, q_index)
);

-- How long you have per question (plus a little grace for slow connections).
create or replace function public.quiz_seconds() returns int language sql immutable as $$ select 20 $$;
revoke execute on function public.quiz_seconds() from public, anon;

-- Who's in this relationship besides me?
create or replace function public.quiz_partner(p_rel uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.user_id from public.relationship_members m
   where m.relationship_id = p_rel and m.status = 'active' and m.user_id <> auth.uid() limit 1;
$$;

-- Categories with at least 3 playable questions for this relationship.
create or replace function public.quiz_playable_categories(p_rel uuid)
returns setof text language sql stable security definer set search_path = '' as $$
  select q.category from public.quiz_questions q
   where q.active and (q.relationship_id is null or q.relationship_id = p_rel)
     and not exists (select 1 from public.quiz_reports r where r.question_id = q.id and r.relationship_id = p_rel)
   group by q.category having count(*) >= 3;
$$;

-- How many questions of a round has this person answered?
create or replace function public.quiz_done(p_round uuid, p_user uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.quiz_answers a where a.round_id = p_round and a.user_id = p_user and a.choice is not null;
$$;

create or replace function public.quiz_start_match()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  rel  uuid := public.my_relationship_id();
  partner uuid;
  mid  uuid;
  cats text[];
  used text[] := '{}';
  offer text[];
  r    int;
begin
  if uid is null then raise exception 'Please sign in first.' using errcode = '28000'; end if;
  if rel is null or not exists (select 1 from public.relationships x where x.id = rel and x.status = 'active') then
    raise exception 'Quiz Time opens once your partner has joined.' using errcode = 'P0001';
  end if;
  partner := public.quiz_partner(rel);
  if exists (select 1 from public.quiz_matches m where m.relationship_id = rel and m.status = 'active') then
    raise exception 'You already have a match going — finish or end it first.' using errcode = 'P0001';
  end if;
  select array_agg(c order by random()) into cats from public.quiz_playable_categories(rel) c;
  if coalesce(array_length(cats, 1), 0) < 3 then
    raise exception 'There aren''t enough questions yet.' using errcode = 'P0001';
  end if;
  insert into public.quiz_matches (relationship_id, started_by) values (rel, uid) returning id into mid;
  for r in 1..6 loop
    -- three categories, avoiding ones already offered in this match where possible
    select array_agg(c) into offer from (
      select c from unnest(cats) c order by (c = any(used)), random() limit 3) s;
    used := used || offer;
    insert into public.quiz_rounds (match_id, round_no, picker_id, offered)
    values (mid, r, case when r % 2 = 1 then uid else partner end, offer);
  end loop;
  return mid;
end;
$$;

create or replace function public.quiz_pick_category(p_round uuid, p_category text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rd  public.quiz_rounds%rowtype;
  m   public.quiz_matches%rowtype;
  prev uuid;
  qids uuid[];
  ord jsonb;
begin
  select * into rd from public.quiz_rounds where id = p_round for update;
  select * into m from public.quiz_matches where id = rd.match_id;
  if not found or not public.is_member(m.relationship_id) then
    raise exception 'We couldn''t find that round.' using errcode = 'P0001';
  end if;
  if m.status <> 'active' then raise exception 'This match is over.' using errcode = 'P0001'; end if;
  if rd.picker_id <> uid then raise exception 'It''s your partner''s turn to pick this one.' using errcode = 'P0001'; end if;
  if rd.category is not null then raise exception 'This round''s category is already picked.' using errcode = 'P0001'; end if;
  if not (p_category = any(rd.offered)) then raise exception 'Pick one of the three categories offered.' using errcode = '22023'; end if;
  if rd.round_no > 1 then
    select id into prev from public.quiz_rounds where match_id = rd.match_id and round_no = rd.round_no - 1;
    if public.quiz_done(prev, uid) < 3 then
      raise exception 'Finish the round before this one first.' using errcode = 'P0001';
    end if;
  end if;
  -- three questions: fresh ones first (not seen in your earlier rounds), never reported ones
  select array_agg(id) into qids from (
    select q.id from public.quiz_questions q
     where q.category = p_category and q.active
       and (q.relationship_id is null or q.relationship_id = m.relationship_id)
       and not exists (select 1 from public.quiz_reports x where x.question_id = q.id and x.relationship_id = m.relationship_id)
     order by exists (select 1 from public.quiz_rounds r2 join public.quiz_matches m2 on m2.id = r2.match_id
                       where m2.relationship_id = m.relationship_id and q.id = any(r2.question_ids)), random()
     limit 3) s;
  if coalesce(array_length(qids, 1), 0) < 3 then
    raise exception 'That category ran out of questions — pick another.' using errcode = 'P0001';
  end if;
  select jsonb_agg(o) into ord from (
    select (select jsonb_agg(x order by random()) from unnest(array[0, 1, 2, 3]) x) o from generate_series(1, 3)) s;
  update public.quiz_rounds set category = p_category, question_ids = qids, orders = ord, picked_at = now() where id = rd.id;
end;
$$;

-- Open question p_idx of a round. Starts its clock the first time; never resets it.
create or replace function public.quiz_open_question(p_round uuid, p_idx int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rd  public.quiz_rounds%rowtype;
  m   public.quiz_matches%rowtype;
  q   public.quiz_questions%rowtype;
  a   public.quiz_answers%rowtype;
  prev uuid;
  opts text[];
  ord jsonb;
begin
  select * into rd from public.quiz_rounds where id = p_round;
  select * into m from public.quiz_matches where id = rd.match_id;
  if not found or not public.is_member(m.relationship_id) then
    raise exception 'We couldn''t find that round.' using errcode = 'P0001';
  end if;
  if m.status <> 'active' then raise exception 'This match is over.' using errcode = 'P0001'; end if;
  if rd.category is null then raise exception 'This round''s category hasn''t been picked yet.' using errcode = 'P0001'; end if;
  if p_idx not between 0 and 2 then raise exception 'Unknown question.' using errcode = '22023'; end if;
  if rd.round_no > 1 then
    select id into prev from public.quiz_rounds where match_id = rd.match_id and round_no = rd.round_no - 1;
    if public.quiz_done(prev, uid) < 3 then raise exception 'Finish the round before this one first.' using errcode = 'P0001'; end if;
  end if;
  if public.quiz_done(p_round, uid) < p_idx then raise exception 'Answer the questions in order.' using errcode = 'P0001'; end if;
  insert into public.quiz_answers (round_id, user_id, q_index) values (p_round, uid, p_idx) on conflict do nothing;
  select * into a from public.quiz_answers where round_id = p_round and user_id = uid and q_index = p_idx;
  if a.choice is not null then raise exception 'You''ve already answered this one.' using errcode = 'P0001'; end if;
  select * into q from public.quiz_questions where id = rd.question_ids[p_idx + 1];
  ord := rd.orders -> p_idx;
  opts := array[q.correct, q.wrong[1], q.wrong[2], q.wrong[3]];
  return jsonb_build_object(
    'question', q.question, 'question_id', q.id, 'source', q.source, 'difficulty', q.difficulty,
    'options', (select jsonb_agg(opts[(e)::int + 1] order by n) from jsonb_array_elements_text(ord) with ordinality t(e, n)),
    'seconds_left', greatest(0, public.quiz_seconds() - extract(epoch from now() - a.shown_at))::numeric(6, 1));
end;
$$;

create or replace function public.quiz_answer(p_round uuid, p_idx int, p_choice int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rd  public.quiz_rounds%rowtype;
  m   public.quiz_matches%rowtype;
  a   public.quiz_answers%rowtype;
  pa  public.quiz_answers%rowtype;
  right_pos int;
  late boolean;
  ok boolean;
  partner uuid;
begin
  select * into rd from public.quiz_rounds where id = p_round;
  select * into m from public.quiz_matches where id = rd.match_id;
  if not found or not public.is_member(m.relationship_id) then
    raise exception 'We couldn''t find that round.' using errcode = 'P0001';
  end if;
  select * into a from public.quiz_answers where round_id = p_round and user_id = uid and q_index = p_idx for update;
  if not found then raise exception 'Open the question first.' using errcode = 'P0001'; end if;
  if a.choice is not null then raise exception 'You''ve already answered this one.' using errcode = 'P0001'; end if;
  if p_choice not between -1 and 3 then raise exception 'Unknown answer.' using errcode = '22023'; end if;
  -- where did the right answer land for this question?
  select (n - 1)::int into right_pos from jsonb_array_elements_text(rd.orders -> p_idx) with ordinality t(e, n) where e = '0';
  late := now() > a.shown_at + make_interval(secs => public.quiz_seconds() + 3);
  ok := not late and p_choice = right_pos;
  update public.quiz_answers set choice = case when late then -1 else p_choice end, correct = ok, answered_at = now()
   where round_id = p_round and user_id = uid and q_index = p_idx;
  -- finished? (both answered all 18)
  if m.status = 'active' and (select count(*) from public.quiz_answers x join public.quiz_rounds r on r.id = x.round_id
                               where r.match_id = m.id and x.choice is not null) = 36 then
    update public.quiz_matches set status = 'finished', finished_at = now() where id = m.id;
  end if;
  partner := public.quiz_partner(m.relationship_id);
  select * into pa from public.quiz_answers where round_id = p_round and user_id = partner and q_index = p_idx and choice is not null;
  return jsonb_build_object('correct', ok, 'timed_out', late, 'right', right_pos, 'choice', case when late then -1 else p_choice end,
    'partner', case when pa.user_id is null then null else jsonb_build_object('choice', pa.choice, 'correct', pa.correct) end);
end;
$$;

-- Everything the match screen needs, with your partner's answers only where you've answered too.
create or replace function public.quiz_match_state(p_match uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m   public.quiz_matches%rowtype;
  partner uuid;
  rounds jsonb;
  next text := 'wait';
  next_round int;
  my_score int; their_score int;
  r record;
begin
  select * into m from public.quiz_matches where id = p_match;
  if not found or not public.is_member(m.relationship_id) then
    raise exception 'We couldn''t find that match.' using errcode = 'P0001';
  end if;
  partner := public.quiz_partner(m.relationship_id);
  select jsonb_agg(jsonb_build_object(
      'id', rd.id, 'round_no', rd.round_no, 'picker_id', rd.picker_id, 'offered', rd.offered, 'category', rd.category,
      'my_done', public.quiz_done(rd.id, uid), 'partner_done', public.quiz_done(rd.id, partner),
      'questions', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'index', i - 1,
                 'mine', case when me.choice is null then null else jsonb_build_object('choice', me.choice, 'correct', me.correct) end,
                 'partner', case when me.choice is null or th.choice is null then (case when th.choice is null then null else '"hidden"'::jsonb end)
                                 else jsonb_build_object('choice', th.choice, 'correct', th.correct) end,
                 -- for review: only once you've answered (or the match is over)
                 'review', case when me.choice is null and m.status = 'active' then null else jsonb_build_object(
                    'question', q.question, 'source', q.source, 'question_id', q.id,
                    'options', (select jsonb_agg((array[q.correct, q.wrong[1], q.wrong[2], q.wrong[3]])[(e)::int + 1] order by n)
                                  from jsonb_array_elements_text(rd.orders -> (i - 1)) with ordinality t(e, n)),
                    'right', (select (n - 1)::int from jsonb_array_elements_text(rd.orders -> (i - 1)) with ordinality t(e, n) where e = '0')) end)
               order by i), '[]'::jsonb)
          from generate_subscripts(rd.question_ids, 1) i
          join public.quiz_questions q on q.id = rd.question_ids[i]
          left join public.quiz_answers me on me.round_id = rd.id and me.user_id = uid and me.q_index = i - 1
          left join public.quiz_answers th on th.round_id = rd.id and th.user_id = partner and th.q_index = i - 1)
    ) order by rd.round_no) into rounds
    from public.quiz_rounds rd where rd.match_id = m.id;

  -- scores: yours, and your partner's only on questions you've both answered (all of it once the match is over)
  select count(*) filter (where me.correct)::int,
         count(*) filter (where th.correct and (me.choice is not null or m.status <> 'active'))::int
    into my_score, their_score
    from public.quiz_rounds rd
    cross join generate_series(0, 2) i
    left join public.quiz_answers me on me.round_id = rd.id and me.user_id = uid and me.q_index = i
    left join public.quiz_answers th on th.round_id = rd.id and th.user_id = partner and th.q_index = i
   where rd.match_id = m.id;

  if m.status = 'active' then
    for r in select rd.* from public.quiz_rounds rd where rd.match_id = m.id order by rd.round_no loop
      if public.quiz_done(r.id, uid) < 3 then
        next_round := r.round_no;
        if r.category is null then next := case when r.picker_id = uid then 'pick' else 'wait' end;
        else next := 'play'; end if;
        exit;
      end if;
    end loop;
    if next_round is null then next := 'wait'; end if;
  else
    next := m.status;
  end if;

  return jsonb_build_object('id', m.id, 'status', m.status, 'started_by', m.started_by, 'created_at', m.created_at,
    'finished_at', m.finished_at, 'ended_by', m.ended_by, 'partner_id', partner,
    'my_score', my_score, 'partner_score', their_score, 'next', next, 'next_round', next_round, 'rounds', rounds,
    'seconds', public.quiz_seconds());
end;
$$;

-- Your current match (if any) and the last 30 finished ones.
create or replace function public.quiz_matches_list()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'status', m.status, 'created_at', m.created_at, 'finished_at', m.finished_at,
           'categories', (select coalesce(jsonb_agg(r.category order by r.round_no) filter (where r.category is not null), '[]'::jsonb)
                            from public.quiz_rounds r where r.match_id = m.id),
           'scores', case when m.status = 'finished' then (
              select jsonb_object_agg(u, s) from (
                select a.user_id::text u, count(*) filter (where a.correct)::int s
                  from public.quiz_answers a join public.quiz_rounds r on r.id = a.round_id
                 where r.match_id = m.id group by a.user_id) z) else null end)
         order by m.created_at desc), '[]'::jsonb)
    from (select * from public.quiz_matches x
           where x.relationship_id = public.my_relationship_id() and x.status <> 'ended'
           order by x.created_at desc limit 31) m;
$$;

create or replace function public.quiz_end_match(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.quiz_matches set status = 'ended', ended_by = auth.uid(), finished_at = now()
   where id = p_match and status = 'active' and public.is_member(relationship_id);
  if not found then raise exception 'There''s no match going to end.' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.quiz_report_question(p_question uuid, p_reason text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
begin
  if char_length(coalesce(p_reason, '')) > 200 then raise exception 'Please keep it short.' using errcode = '22001'; end if;
  -- only questions that have come up in your own matches
  if not exists (select 1 from public.quiz_rounds r join public.quiz_matches m on m.id = r.match_id
                  where m.relationship_id = rel and p_question = any(r.question_ids)) then
    raise exception 'We couldn''t find that question.' using errcode = 'P0001';
  end if;
  insert into public.quiz_reports (question_id, relationship_id, reported_by, reason)
  values (p_question, rel, auth.uid(), trim(coalesce(p_reason, '')))
  on conflict (question_id, relationship_id) do update set reason = excluded.reason, reported_by = excluded.reported_by;
end;
$$;

-- Your own questions (only the person who wrote one can see its answer).
create or replace function public.quiz_add_question(p_category text, p_question text, p_correct text, p_wrong1 text, p_wrong2 text, p_wrong3 text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
  qq text := trim(coalesce(p_question, ''));
  c text := trim(coalesce(p_correct, ''));
  w text[] := array[trim(coalesce(p_wrong1, '')), trim(coalesce(p_wrong2, '')), trim(coalesce(p_wrong3, ''))];
  nid uuid;
begin
  if rel is null then raise exception 'You are not part of a space yet.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.quiz_categories where code = p_category) then
    raise exception 'Unknown category.' using errcode = '22023';
  end if;
  if char_length(qq) < 5 or char_length(qq) > 400 then raise exception 'Write a question (5–400 characters).' using errcode = '22023'; end if;
  if c = '' or '' = any(w) or char_length(c) > 200 or exists (select 1 from unnest(w) x where char_length(x) > 200) then
    raise exception 'Add the right answer and three wrong ones (up to 200 characters each).' using errcode = '22023';
  end if;
  if (select count(distinct lower(x)) from unnest(w || c) x) < 4 then
    raise exception 'The four answers need to be different.' using errcode = '22023';
  end if;
  if (select count(*) from public.quiz_questions where relationship_id = rel) >= 500 then
    raise exception 'That''s 500 questions of your own — wonderful! Delete a few to add more.' using errcode = 'P0001';
  end if;
  insert into public.quiz_questions (category, question, correct, wrong, difficulty, source, relationship_id, created_by)
  values (p_category, qq, c, w, 'medium', 'ours', rel, auth.uid()) returning id into nid;
  return nid;
end;
$$;

create or replace function public.quiz_my_questions()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'category', q.category, 'question', q.question, 'correct', q.correct,
                                               'wrong', q.wrong, 'created_at', q.created_at) order by q.created_at desc), '[]'::jsonb)
    from public.quiz_questions q
   where q.relationship_id = public.my_relationship_id() and q.created_by = auth.uid();
$$;

create or replace function public.quiz_delete_question(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- keep it if it's already been played (so old matches still make sense) — just retire it
  update public.quiz_questions set active = false
   where id = p_id and relationship_id = public.my_relationship_id() and created_by = auth.uid();
  if not found then raise exception 'We couldn''t find that question.' using errcode = 'P0001'; end if;
  delete from public.quiz_questions q where q.id = p_id
     and not exists (select 1 from public.quiz_rounds r where p_id = any(r.question_ids));
end;
$$;

create or replace function public.quiz_categories_list()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'label', c.label) order by c.sort), '[]'::jsonb)
    from public.quiz_categories c;
$$;

-- ------------------------------------------------------------------ RLS
-- No direct reads anywhere: answers must stay secret until you've answered.
alter table public.quiz_categories enable row level security;
alter table public.quiz_questions  enable row level security;
alter table public.quiz_reports    enable row level security;
alter table public.quiz_matches    enable row level security;
alter table public.quiz_rounds     enable row level security;
alter table public.quiz_answers    enable row level security;
revoke all on public.quiz_categories, public.quiz_questions, public.quiz_reports, public.quiz_matches,
              public.quiz_rounds, public.quiz_answers from anon, authenticated;

-- ------------------------------------------------ the starter bank (300 questions, reviewed by Vee)
insert into public.quiz_questions (category, question, correct, wrong, difficulty, source, external_key) values
  ('malaysia', 'What is the capital of Sarawak?', 'Kuching', array['Miri', 'Sibu', 'Bintulu'], 'easy', 'starter', 'starter:f6c64b2d927b37fd0d4cf3f8544510ec'),
  ('malaysia', 'Mount Kinabalu is in which Malaysian state?', 'Sabah', array['Sarawak', 'Pahang', 'Perak'], 'easy', 'starter', 'starter:f1c645a90dbce50e0a8877bdd31cb238'),
  ('malaysia', 'What is Malaysia''s national flower?', 'Hibiscus (bunga raya)', array['Orchid', 'Rafflesia', 'Frangipani'], 'easy', 'starter', 'starter:3351f3c9ec059770c485e8754d8e7ff1'),
  ('malaysia', 'The Rafflesia, found in Borneo, is famous for being…', 'The largest single flower in the world', array['The smallest flower in the world', 'A flower that blooms only underwater', 'The only blue flower in Asia'], 'easy', 'starter', 'starter:ba983722f9ed2c33e68ef3ef39b407fe'),
  ('malaysia', 'Which harvest festival do the Dayak peoples of Sarawak celebrate on 1 June?', 'Gawai Dayak', array['Hari Raya', 'Kaamatan', 'Thaipusam'], 'easy', 'starter', 'starter:d3e86b36dd0d150b0158a4a7b404036b'),
  ('malaysia', 'Kuching''s name is often linked to which animal, celebrated with statues around the city?', 'Cat', array['Hornbill', 'Crocodile', 'Orangutan'], 'easy', 'starter', 'starter:fbde35757b0b987364654a582940f928'),
  ('malaysia', 'What is Sarawak''s state bird?', 'Rhinoceros hornbill', array['Peacock', 'Kingfisher', 'Sea eagle'], 'medium', 'starter', 'starter:12e58489c2a834f1abd589c75e4d0994'),
  ('malaysia', 'What is the longest river in Malaysia?', 'Rajang River', array['Kinabatangan River', 'Pahang River', 'Baram River'], 'medium', 'starter', 'starter:73cc0b5a9ff6059c8c448b1d91656a8d'),
  ('malaysia', 'What is a traditional Iban longhouse called in Iban?', 'Rumah panjai', array['Rumah kampung', 'Balai raya', 'Pondok'], 'medium', 'starter', 'starter:027e80a044f83eead6a179ce52d6251a'),
  ('malaysia', 'Which Sarawak dish did chef Anthony Bourdain famously call ''breakfast of the gods''?', 'Sarawak laksa', array['Kolo mee', 'Nasi lemak', 'Manok pansoh'], 'medium', 'starter', 'starter:9dbbb492f3d7a0acafbe9c40fec5e124'),
  ('malaysia', 'On which date is Malaysia''s Independence Day (Hari Merdeka)?', '31 August', array['16 September', '1 June', '9 May'], 'easy', 'starter', 'starter:cbf56bd36861349d033769987ec5c448'),
  ('malaysia', 'Malaysia Day marks Sabah and Sarawak joining Malaysia. When is it?', '16 September', array['31 August', '1 January', '22 July'], 'medium', 'starter', 'starter:35aef76ffe0e3c26e487683bb1071910'),
  ('malaysia', 'What is Malaysia''s currency?', 'Ringgit', array['Rupiah', 'Baht', 'Dollar'], 'easy', 'starter', 'starter:bd1bb3f0f99154c69ae13fa4a6ebc2d4'),
  ('malaysia', 'In which city are the Petronas Twin Towers?', 'Kuala Lumpur', array['Kuching', 'Johor Bahru', 'Putrajaya'], 'easy', 'starter', 'starter:e63dfb0236584673310a1233a28e2ee6'),
  ('malaysia', 'What does ''orangutan'' mean in Malay?', 'Person of the forest', array['Red monkey', 'King of the trees', 'Long arms'], 'easy', 'starter', 'starter:9a0d0b7b6c7aea8a0231d3f7bbc9d94f'),
  ('malaysia', 'Bako, Sarawak''s oldest national park, is best known for which animal?', 'Proboscis monkey', array['Sumatran rhino', 'Clouded leopard', 'Sun bear'], 'medium', 'starter', 'starter:5cf0da36ad8c9c4b18b4094609cdec2c'),
  ('malaysia', 'Borneo is shared by Malaysia, Indonesia and which other country?', 'Brunei', array['Singapore', 'The Philippines', 'Thailand'], 'easy', 'starter', 'starter:99885eee9761b94a6935d61284794ebc'),
  ('malaysia', 'The huge Sarawak Chamber cave is in which national park?', 'Gunung Mulu', array['Bako', 'Niah', 'Kinabalu'], 'hard', 'starter', 'starter:3f7c0253dba646b70f9066e54f353703'),
  ('malaysia', 'What is kek lapis Sarawak?', 'A colourful layer cake', array['A rice dumpling', 'A spicy noodle soup', 'A coconut drink'], 'easy', 'starter', 'starter:a98f15565d4aa4622468b63413fae381'),
  ('malaysia', 'Sarawak was ruled for about a century by the ''White Rajahs'' of which family?', 'Brooke', array['Raffles', 'Windsor', 'Crawford'], 'medium', 'starter', 'starter:5fc2c5cd610334e5ba9f4b9bd06ce2a5'),
  ('sweden', 'What is the capital of Sweden?', 'Stockholm', array['Gothenburg', 'Malmö', 'Uppsala'], 'easy', 'starter', 'starter:99c6e75c29b75fd3e19c0cb536b55923'),
  ('sweden', 'What is ''fika''?', 'A coffee break, usually with something sweet', array['A summer festival', 'A type of herring', 'A wooden horse'], 'easy', 'starter', 'starter:6385df0a71eb2185dc075bcbdc6778bb'),
  ('sweden', 'At Midsummer, Swedes traditionally dance around a…', 'Maypole (midsommarstång)', array['Bonfire', 'Christmas tree', 'Stone circle'], 'easy', 'starter', 'starter:5b0460598d72716ee1d707700232dae4'),
  ('sweden', 'Which Swedish band won Eurovision in 1974 with ''Waterloo''?', 'ABBA', array['Roxette', 'Ace of Base', 'Europe'], 'easy', 'starter', 'starter:414f72213bd858d5352607e69940bc99'),
  ('sweden', 'Alfred Nobel, who founded the Nobel Prizes, invented…', 'Dynamite', array['The telephone', 'The zipper', 'The safety match'], 'easy', 'starter', 'starter:fa8152d82afbade0d8ff182a10abcb0d'),
  ('sweden', 'What is Sweden''s currency?', 'Krona', array['Euro', 'Krone', 'Mark'], 'easy', 'starter', 'starter:68202d1126860d746931563e13b9b883'),
  ('sweden', 'In which year was Lund University founded?', '1666', array['1477', '1810', '1901'], 'hard', 'starter', 'starter:70e474a8bac02118d69a6e48a16fc7f1'),
  ('sweden', 'On which date is Lucia (Saint Lucy''s Day) celebrated in Sweden?', '13 December', array['24 December', '6 June', '1 May'], 'medium', 'starter', 'starter:53cc838a24ebff5ef0df420149bcd045'),
  ('sweden', 'Which furniture company did Ingvar Kamprad found in Sweden in 1943?', 'IKEA', array['H&M', 'Volvo', 'Ericsson'], 'easy', 'starter', 'starter:3f0b5981a0f62f4378646eff90907fd5'),
  ('sweden', 'What is the largest lake in Sweden?', 'Vänern', array['Vättern', 'Mälaren', 'Siljan'], 'medium', 'starter', 'starter:29a83c811e75d3674cd9cd62e7359206'),
  ('sweden', 'The Öresund Bridge links Malmö with which city?', 'Copenhagen', array['Oslo', 'Helsinki', 'Berlin'], 'easy', 'starter', 'starter:3a5eac29d2015cda9af2063d25b5c719'),
  ('sweden', 'Sweden celebrates Cinnamon Bun Day (Kanelbullens dag) on…', '4 October', array['4 July', '14 February', '31 October'], 'hard', 'starter', 'starter:ffb5781bdfb21c189e1f2de665f1db48'),
  ('sweden', 'What is surströmming?', 'Fermented herring', array['A berry jam', 'A sweet bun', 'A reindeer stew'], 'easy', 'starter', 'starter:9ea37ab2116b82609fc0df3ef8d90f28'),
  ('sweden', 'What does the Swedish word ''lagom'' mean?', 'Just the right amount', array['Very cold', 'Cosy at home', 'Good luck'], 'medium', 'starter', 'starter:1ff05b21256e16f0105a4a66f3d4b3e4'),
  ('sweden', 'The Sámi people of northern Sweden are known for herding which animal?', 'Reindeer', array['Sheep', 'Moose', 'Goats'], 'easy', 'starter', 'starter:049244e4a8ea0fe23fb8a6857cb702a0'),
  ('sweden', 'Which car brand was founded in Gothenburg in 1927?', 'Volvo', array['Saab', 'Scania', 'Koenigsegg'], 'medium', 'starter', 'starter:0311d987ade4bc982d64f53c382a6e9b'),
  ('sweden', 'Which music streaming service was founded in Stockholm in 2006?', 'Spotify', array['SoundCloud', 'Deezer', 'Tidal'], 'easy', 'starter', 'starter:93362441d55a99c5f7ba204e5c1ab24a'),
  ('sweden', 'What is Sweden''s National Day?', '6 June', array['17 May', '24 June', '1 August'], 'medium', 'starter', 'starter:7e81265059bdacd301c75cea8315ecec'),
  ('sweden', 'Which famously strong girl was created by Astrid Lindgren?', 'Pippi Longstocking', array['Matilda', 'Heidi', 'Anne of Green Gables'], 'easy', 'starter', 'starter:bc343d1416046de1bb29d16394c2ab83'),
  ('sweden', 'The traditional Dala horse (dalahäst) is most famously painted which colour?', 'Red', array['Blue', 'Yellow', 'Green'], 'easy', 'starter', 'starter:10ee5c506e8b3582213600170517d1b9'),
  ('chile', 'What is the capital of Chile?', 'Santiago', array['Valparaíso', 'Concepción', 'Antofagasta'], 'easy', 'starter', 'starter:48eaf97944a29169b80c438d5440f774'),
  ('chile', 'Which Chilean desert is one of the driest places on Earth?', 'Atacama', array['Sahara', 'Gobi', 'Patagonian'], 'easy', 'starter', 'starter:bb9999a275b72164987779af69c9a32f'),
  ('chile', 'Which mountain range runs along Chile''s eastern side?', 'The Andes', array['The Alps', 'The Rockies', 'The Pyrenees'], 'easy', 'starter', 'starter:340129b343ee7f4ba13d50e069862e54'),
  ('chile', 'What are the giant stone statues of Easter Island called?', 'Moai', array['Tiki', 'Olmec heads', 'Totems'], 'easy', 'starter', 'starter:0a6665cad10106209e43b283803c66f3'),
  ('chile', 'What is Chile''s national dance?', 'Cueca', array['Tango', 'Samba', 'Salsa'], 'medium', 'starter', 'starter:144436ce25cf5e5bd26a69a1f1ce1b58'),
  ('chile', 'Which Chilean poet won the Nobel Prize in Literature in 1971?', 'Pablo Neruda', array['Gabriel García Márquez', 'Jorge Luis Borges', 'Octavio Paz'], 'medium', 'starter', 'starter:d3d0286894f29de01632e717e80565bb'),
  ('chile', 'Which Chilean was the first Latin American to win the Nobel Prize in Literature (1945)?', 'Gabriela Mistral', array['Pablo Neruda', 'Isabel Allende', 'Violeta Parra'], 'hard', 'starter', 'starter:d92a9ec20537521bbd3a938b83333278'),
  ('chile', 'Chile''s Fiestas Patrias are centred on which date?', '18 September', array['4 July', '12 October', '25 December'], 'medium', 'starter', 'starter:575ef9f7bd030f07c73833ef4ca6b02b'),
  ('chile', 'What is Chile''s currency?', 'Peso', array['Sol', 'Real', 'Bolívar'], 'easy', 'starter', 'starter:50754e6a7610770e15a2f681355f2727'),
  ('chile', 'Which grape brandy do Chile and Peru both claim as their national drink?', 'Pisco', array['Tequila', 'Cachaça', 'Rum'], 'medium', 'starter', 'starter:9e3a6ab21a1e4434fb70fad7d54e1dc8'),
  ('chile', 'What is the highest mountain in the Americas, near the Chile–Argentina border?', 'Aconcagua', array['Ojos del Salado', 'Chimborazo', 'Denali'], 'medium', 'starter', 'starter:5e88e9c2febac3e579d1828a2787e003'),
  ('chile', 'Torres del Paine National Park is in which region?', 'Patagonia', array['The Atacama', 'The Amazon', 'The Pampas'], 'easy', 'starter', 'starter:1773c7e8883c83b1d89c6f315d5b882c'),
  ('chile', 'What is the classic filling of a Chilean ''empanada de pino''?', 'Beef, onion, egg and olive', array['Cheese and ham', 'Seafood', 'Sweet corn'], 'medium', 'starter', 'starter:e96cf6f90fb27f9896671bc18666aa04'),
  ('chile', 'What is the indigenous name of Easter Island and its people?', 'Rapa Nui', array['Aotearoa', 'Hawaiki', 'Tahiti'], 'medium', 'starter', 'starter:b7b2f8f921e6fb3107c856e035136459'),
  ('chile', 'What is the largest indigenous people in Chile?', 'Mapuche', array['Inca', 'Aymara', 'Guaraní'], 'medium', 'starter', 'starter:3ebf302f0b85bd1f36568197d41af343'),
  ('chile', 'What is the largest country in South America?', 'Brazil', array['Argentina', 'Peru', 'Colombia'], 'easy', 'starter', 'starter:7e11785858de932cab8432dc423208be'),
  ('chile', 'The world''s highest waterfall, Angel Falls, is in which country?', 'Venezuela', array['Brazil', 'Argentina', 'Guyana'], 'medium', 'starter', 'starter:baaa7db329757befc5fbacc7a21b02d4'),
  ('chile', 'In which country is Machu Picchu?', 'Peru', array['Bolivia', 'Chile', 'Ecuador'], 'easy', 'starter', 'starter:3e2d337c33948513c6a3888b4cb4f768'),
  ('chile', 'Roughly how long is Chile from north to south?', 'About 4,300 km', array['About 1,300 km', 'About 7,300 km', 'About 10,300 km'], 'hard', 'starter', 'starter:73ede6e5c9ff1645a38cf9ad83b719d1'),
  ('chile', 'The port city of Valparaíso is famous for its…', 'Colourful hillside houses and funiculars', array['Ancient pyramids', 'Glaciers in the city centre', 'Floating markets'], 'easy', 'starter', 'starter:947d0e4aad9c481f8bcb34188f41959d'),
  ('general', 'How many continents are there in the most commonly taught model?', '7', array['5', '6', '8'], 'easy', 'starter', 'starter:e1dddf6004aa709b8bc72aafee4718bc'),
  ('general', 'How many minutes are there in a day?', '1,440', array['1,240', '1,640', '960'], 'easy', 'starter', 'starter:ebfa743126f5f2ed3c88ae17650c4826'),
  ('general', 'What is the hardest natural substance?', 'Diamond', array['Quartz', 'Granite', 'Steel'], 'easy', 'starter', 'starter:36cb160737eb83e7e4e8267ef1a4f851'),
  ('general', 'Which planet is known as the Red Planet?', 'Mars', array['Venus', 'Jupiter', 'Mercury'], 'easy', 'starter', 'starter:a36f6da802c93ca63d0c5b97110210fc'),
  ('general', 'How many sides does a hexagon have?', '6', array['5', '7', '8'], 'easy', 'starter', 'starter:725c88a241b021b486f86ec14b524d4e'),
  ('general', 'What colour do you get by mixing blue and yellow paint?', 'Green', array['Purple', 'Orange', 'Brown'], 'easy', 'starter', 'starter:043b214cf7391cc5b1b3d11839dfed3b'),
  ('general', 'Which language has the most native speakers?', 'Mandarin Chinese', array['English', 'Spanish', 'Hindi'], 'medium', 'starter', 'starter:9dfb5d83aac8ff10f9ff75159d98dd7e'),
  ('general', 'What is the largest ocean on Earth?', 'Pacific', array['Atlantic', 'Indian', 'Arctic'], 'easy', 'starter', 'starter:724f88873357926f2b9c6a02f73930c6'),
  ('general', 'How many players does a football (soccer) team have on the pitch?', '11', array['9', '10', '12'], 'easy', 'starter', 'starter:3d5d347d1a213453b963b7e6fa0975de'),
  ('general', 'At what temperature does water freeze in Fahrenheit?', '32°F', array['0°F', '100°F', '212°F'], 'medium', 'starter', 'starter:f1072c2014c188e4a77fe16b21489c04'),
  ('general', 'Who painted the Mona Lisa?', 'Leonardo da Vinci', array['Michelangelo', 'Raphael', 'Vincent van Gogh'], 'easy', 'starter', 'starter:0c3c1fa6050dbd499e847a95b893c246'),
  ('general', 'What is the smallest prime number?', '2', array['1', '3', '0'], 'medium', 'starter', 'starter:b31623601c9c0f71ba2bc1c7c7fc7ed5'),
  ('general', 'Which gas do plants take in from the air?', 'Carbon dioxide', array['Oxygen', 'Nitrogen', 'Helium'], 'easy', 'starter', 'starter:eac65570022968cd2b55078586f73274'),
  ('general', 'What is the main ingredient in guacamole?', 'Avocado', array['Lime', 'Tomato', 'Chilli'], 'easy', 'starter', 'starter:503a0d29a4f9552386feebac515e70b7'),
  ('general', 'How many strings does a standard guitar have?', '6', array['4', '5', '8'], 'easy', 'starter', 'starter:3dd025e0405d93e8db4cb0cafa37fd98'),
  ('general', 'What is the longest bone in the human body?', 'Femur (thigh bone)', array['Tibia', 'Humerus', 'Spine'], 'medium', 'starter', 'starter:c9509b34ff1598366a11c45528f1418d'),
  ('general', 'In which country did the ancient Olympic Games begin?', 'Greece', array['Italy', 'Egypt', 'France'], 'easy', 'starter', 'starter:caea75e9098863e983c442b7201dbe32'),
  ('general', 'What is the tallest animal in the world?', 'Giraffe', array['Elephant', 'Ostrich', 'Camel'], 'easy', 'starter', 'starter:57cc883689c6b6d5e9804c1c44026e6d'),
  ('general', 'What does ''www'' stand for in a web address?', 'World Wide Web', array['World Web Window', 'Wide Web World', 'Web World Wide'], 'easy', 'starter', 'starter:c1cd46ee313fc5db2c9920bd63fbfc07'),
  ('general', 'How many official time zones does China use?', '1', array['3', '4', '5'], 'hard', 'starter', 'starter:bc60b7266af1ef41c4c2bc6246fa5bdb'),
  ('geography', 'What is the largest country in the world by area?', 'Russia', array['Canada', 'China', 'United States'], 'easy', 'starter', 'starter:eb05d0a4f2321de5da37ecfe4dcb7657'),
  ('geography', 'What is the capital of Australia?', 'Canberra', array['Sydney', 'Melbourne', 'Perth'], 'medium', 'starter', 'starter:34b92c79175b6248d0a98e205b2b181b'),
  ('geography', 'What is the tallest mountain above sea level?', 'Mount Everest', array['K2', 'Kangchenjunga', 'Kilimanjaro'], 'easy', 'starter', 'starter:d7a415351ec25ff2b036d4c7618f8507'),
  ('geography', 'Which country has had the largest population since 2023?', 'India', array['China', 'United States', 'Indonesia'], 'medium', 'starter', 'starter:4d5488f61418ec0a72553722dd67ce73'),
  ('geography', 'What is the capital of Canada?', 'Ottawa', array['Toronto', 'Vancouver', 'Montreal'], 'medium', 'starter', 'starter:aa9f727e8736525234e7cd39084058ad'),
  ('geography', 'What is the largest hot desert in the world?', 'Sahara', array['Arabian', 'Kalahari', 'Gobi'], 'easy', 'starter', 'starter:4b98f004a20d8506414a23ef843febfd'),
  ('geography', 'Which country is shaped like a boot?', 'Italy', array['Greece', 'Portugal', 'Chile'], 'easy', 'starter', 'starter:e9df8d56fb43c7f35c8301b5c2b436cb'),
  ('geography', 'What is the smallest country in the world?', 'Vatican City', array['Monaco', 'San Marino', 'Liechtenstein'], 'easy', 'starter', 'starter:008b26aa0acf9ffa1d6296a4e94722e4'),
  ('geography', 'Which river flows through Paris?', 'Seine', array['Thames', 'Danube', 'Rhine'], 'easy', 'starter', 'starter:46bc93b7de0299b97f0a2a8fb8f4cd55'),
  ('geography', 'What is the capital of Japan?', 'Tokyo', array['Kyoto', 'Osaka', 'Seoul'], 'easy', 'starter', 'starter:40f4e7f828831ca034a5438b27240fd1'),
  ('geography', 'What is the largest island in the world (not counting Australia)?', 'Greenland', array['New Guinea', 'Borneo', 'Madagascar'], 'medium', 'starter', 'starter:40bb0e2d860cef0af759e9a8224bc31f'),
  ('geography', 'Borneo is the world''s ___ largest island.', 'Third', array['Second', 'Fifth', 'Tenth'], 'medium', 'starter', 'starter:13ea191fdd77508025c04ce1058a03bb'),
  ('geography', 'Which strait separates Spain from Morocco?', 'Strait of Gibraltar', array['Bosphorus', 'Strait of Malacca', 'Strait of Dover'], 'medium', 'starter', 'starter:7b272df6d403af2fedd03c96351b754f'),
  ('geography', 'The Strait of Malacca lies between Peninsular Malaysia and which island?', 'Sumatra', array['Java', 'Borneo', 'Sulawesi'], 'medium', 'starter', 'starter:aa2d26a4bfffc0673359ce46ba61eafe'),
  ('geography', 'Mount Kilimanjaro is in which country?', 'Tanzania', array['Kenya', 'Uganda', 'Ethiopia'], 'medium', 'starter', 'starter:ea6e4eda5c6c3cddda7dd9a40a830251'),
  ('geography', 'Which line divides the Earth into the Northern and Southern Hemispheres?', 'The Equator', array['The Prime Meridian', 'The Tropic of Cancer', 'The International Date Line'], 'easy', 'starter', 'starter:e95870d33abbf2a5006d34987cf12dbf'),
  ('geography', 'What is the capital of New Zealand?', 'Wellington', array['Auckland', 'Christchurch', 'Queenstown'], 'medium', 'starter', 'starter:dc3aa9044e17ac0f6edfe58fb402ce17'),
  ('geography', 'Which continent has the most countries?', 'Africa', array['Asia', 'Europe', 'South America'], 'medium', 'starter', 'starter:60fe41112c8c387a22f44bbf0872fe2f'),
  ('geography', 'What is the deepest known point in the ocean?', 'Mariana Trench', array['Puerto Rico Trench', 'Java Trench', 'Tonga Trench'], 'medium', 'starter', 'starter:d7532005284cc9860b07c53945185492'),
  ('geography', 'What is the capital of Iceland?', 'Reykjavík', array['Oslo', 'Helsinki', 'Nuuk'], 'easy', 'starter', 'starter:524bd2006e77700e9559f04c11d97f9d'),
  ('science', 'What is the chemical symbol for gold?', 'Au', array['Ag', 'Gd', 'Go'], 'medium', 'starter', 'starter:7d3aaf106dac1aca772e5c5c96f92b59'),
  ('science', 'Which planet is most famous for its rings?', 'Saturn', array['Mars', 'Neptune', 'Venus'], 'easy', 'starter', 'starter:e8e06b246ecd7e66d6552ca8f1d856be'),
  ('science', 'How many bones does an adult human have?', '206', array['186', '226', '246'], 'medium', 'starter', 'starter:a4c15e4579564e3e4d359a59a71ef2de'),
  ('science', 'What is H₂O?', 'Water', array['Hydrogen peroxide', 'Salt', 'Oxygen'], 'easy', 'starter', 'starter:679bc251e2a8be40ed6d071e055efc6e'),
  ('science', 'Roughly how fast does light travel?', '300,000 km per second', array['30,000 km per second', '3,000 km per second', '3 million km per second'], 'medium', 'starter', 'starter:525ed78201d95e6c352c74dfe3689d3b'),
  ('science', 'What is the closest star to Earth?', 'The Sun', array['Proxima Centauri', 'Sirius', 'Polaris'], 'medium', 'starter', 'starter:d9aa9e72a90a790b06ceef8afd50bd31'),
  ('science', 'Which part of a cell is called its ''powerhouse''?', 'Mitochondria', array['Nucleus', 'Ribosome', 'Chloroplast'], 'easy', 'starter', 'starter:c8bfb7512703a0c968ca10d14e701a59'),
  ('science', 'Which force keeps us on the ground?', 'Gravity', array['Magnetism', 'Friction', 'Inertia'], 'easy', 'starter', 'starter:d05bd0e574a0e9bddf84cbcb681a2e75'),
  ('science', 'How many planets are in our solar system?', '8', array['9', '7', '10'], 'easy', 'starter', 'starter:c002215a59c0cf2f3a1931c4b68146db'),
  ('science', 'Which blood type is known as the universal donor for red blood cells?', 'O negative', array['AB positive', 'A positive', 'B negative'], 'medium', 'starter', 'starter:100f7e543757fe4aea839d2be5cfa088'),
  ('science', 'At sea level, water boils at what temperature?', '100°C', array['90°C', '80°C', '120°C'], 'easy', 'starter', 'starter:c9df7f40a31fb4cdd054c3fc4d54b09c'),
  ('science', 'Who developed the theory of general relativity?', 'Albert Einstein', array['Isaac Newton', 'Stephen Hawking', 'Niels Bohr'], 'easy', 'starter', 'starter:e0f63c7e80e4f8c82ebf55365bccaf58'),
  ('science', 'What is the largest organ of the human body?', 'Skin', array['Liver', 'Brain', 'Lungs'], 'medium', 'starter', 'starter:7aecfab02286668e95d5842b657cbd18'),
  ('science', 'What do bees collect from flowers to make honey?', 'Nectar', array['Pollen', 'Sap', 'Dew'], 'medium', 'starter', 'starter:affddb289a2e6887b69a87a30ad620bd'),
  ('science', 'Which is the hottest planet in our solar system?', 'Venus', array['Mercury', 'Mars', 'Jupiter'], 'medium', 'starter', 'starter:e7d6a73612fc01577c2e8b2e1f7e54a3'),
  ('science', 'What is the process plants use to make food from sunlight?', 'Photosynthesis', array['Respiration', 'Germination', 'Pollination'], 'easy', 'starter', 'starter:b320419d42f249a27e01f3f22589260b'),
  ('science', 'Which element has the chemical symbol Fe?', 'Iron', array['Fluorine', 'Lead', 'Francium'], 'medium', 'starter', 'starter:3007cb3395447c34bf5a97982f2617a4'),
  ('science', 'How many hearts does an octopus have?', '3', array['1', '2', '8'], 'medium', 'starter', 'starter:bdf24b687c0b498ca015fd298e5d9349'),
  ('science', 'What is the most common gas in Earth''s atmosphere?', 'Nitrogen', array['Oxygen', 'Carbon dioxide', 'Argon'], 'medium', 'starter', 'starter:24c57708ac06be7c0e162dd4ef9967a6'),
  ('science', 'What does DNA stand for?', 'Deoxyribonucleic acid', array['Dinitrogen acid', 'Dual nucleic acid', 'Deoxyribose nitrate'], 'hard', 'starter', 'starter:fa699b85b5622208a6d1f3d5c03e900a'),
  ('history', 'In which year did humans first land on the Moon?', '1969', array['1959', '1965', '1972'], 'easy', 'starter', 'starter:4ec916a6dd3380397f236b294383f9f8'),
  ('history', 'Who was the first person to walk on the Moon?', 'Neil Armstrong', array['Buzz Aldrin', 'Yuri Gagarin', 'Michael Collins'], 'easy', 'starter', 'starter:2416d8e0d2de3e069618d1ffc89d1e7e'),
  ('history', 'In which year did the Berlin Wall fall?', '1989', array['1991', '1985', '1961'], 'easy', 'starter', 'starter:e7296df32ab77b7d02c3bdc5cc947af0'),
  ('history', 'Who was the first President of the United States?', 'George Washington', array['Abraham Lincoln', 'Thomas Jefferson', 'John Adams'], 'easy', 'starter', 'starter:d9ffc4f9da29fdce6295a35c5ad1bc67'),
  ('history', 'Which of the Seven Wonders of the Ancient World is still standing?', 'The Great Pyramid of Giza', array['The Hanging Gardens of Babylon', 'The Colossus of Rhodes', 'The Lighthouse of Alexandria'], 'medium', 'starter', 'starter:e24b07a76f3c13f26f751993d5722f57'),
  ('history', 'Which famous ship sank on its first voyage in 1912?', 'Titanic', array['Lusitania', 'Mayflower', 'Endeavour'], 'easy', 'starter', 'starter:d86ea2d9a6d1bd0092f328ea15c3c9a1'),
  ('history', 'Who was the first woman to win a Nobel Prize?', 'Marie Curie', array['Florence Nightingale', 'Ada Lovelace', 'Rosalind Franklin'], 'medium', 'starter', 'starter:2f93ca2680e79657b750349294bb6655'),
  ('history', 'In which year did World War II end?', '1945', array['1944', '1946', '1939'], 'easy', 'starter', 'starter:ac18a2a6cbd0994544c53c9944a0777e'),
  ('history', 'Which civilisation built Machu Picchu?', 'The Inca', array['The Aztecs', 'The Maya', 'The Olmecs'], 'medium', 'starter', 'starter:9b262d50142427fc2638c31ed719359d'),
  ('history', 'Who was the first human to travel into space (1961)?', 'Yuri Gagarin', array['Neil Armstrong', 'Alan Shepard', 'Valentina Tereshkova'], 'medium', 'starter', 'starter:391ea4f3fde1c6e9f078db8a7d485c06'),
  ('history', 'Who brought the movable-type printing press to Europe?', 'Johannes Gutenberg', array['Leonardo da Vinci', 'Galileo Galilei', 'Isaac Newton'], 'medium', 'starter', 'starter:223e24ef6ad44688f1af12be717f4080'),
  ('history', 'Where did the Vikings come from?', 'Scandinavia', array['Greece', 'Spain', 'Egypt'], 'easy', 'starter', 'starter:add63b0c224782efdb3f3f993dcbd322'),
  ('history', 'Which Roman city was buried by Mount Vesuvius in 79 AD?', 'Pompeii', array['Athens', 'Carthage', 'Troy'], 'medium', 'starter', 'starter:6d559ad6a2e1f23b74932adb70317573'),
  ('history', 'In which year did Nelson Mandela become President of South Africa?', '1994', array['1990', '1984', '2000'], 'medium', 'starter', 'starter:56291ca5fc87ec08485e64a349535a16'),
  ('history', 'Which country gave the Statue of Liberty to the United States?', 'France', array['United Kingdom', 'Spain', 'Italy'], 'easy', 'starter', 'starter:792f5155273559dc51a4f67d4565f01d'),
  ('history', 'Who was the UK''s first female Prime Minister?', 'Margaret Thatcher', array['Theresa May', 'Queen Victoria', 'Indira Gandhi'], 'medium', 'starter', 'starter:3560987ec57583ea17cc38947f7afb7d'),
  ('history', 'Which ancient civilisation wrote in hieroglyphs?', 'The Ancient Egyptians', array['The Vikings', 'The Romans', 'The Inca'], 'easy', 'starter', 'starter:2a65504d7c548471c5832c50ba4ceb1a'),
  ('history', 'In which country did the Renaissance begin?', 'Italy', array['France', 'England', 'Spain'], 'medium', 'starter', 'starter:bf6c1e843b7b89a13e87869c25a0aacb'),
  ('history', 'In which year did the Portuguese capture Malacca (Melaka)?', '1511', array['1641', '1824', '1400'], 'hard', 'starter', 'starter:ba02c514ee3f551e701607f4cbfc5472'),
  ('history', 'The Great Wall was built to protect which country?', 'China', array['Japan', 'Mongolia', 'Korea'], 'easy', 'starter', 'starter:38889e34db1480709c82f15ed741c1f9'),
  ('food', 'Sushi comes from which country?', 'Japan', array['China', 'Korea', 'Thailand'], 'easy', 'starter', 'starter:d538c8fefc6ba56bbc463a199146f70e'),
  ('food', 'What is the main ingredient of hummus?', 'Chickpeas', array['Lentils', 'Kidney beans', 'Peas'], 'easy', 'starter', 'starter:57e79dc861727a521c981d0ebee46c53'),
  ('food', 'Paella is a famous dish from which country?', 'Spain', array['Italy', 'Mexico', 'Portugal'], 'easy', 'starter', 'starter:1e1900d2dde79178eb9a9cd7642cb231'),
  ('food', 'The rice in nasi lemak is cooked in what?', 'Coconut milk', array['Cow''s milk', 'Chicken stock', 'Tea'], 'easy', 'starter', 'starter:d78b1a7b9644d343be9194aebef62cd2'),
  ('food', 'What does ''teh tarik'' mean?', 'Pulled tea', array['Hot tea', 'Sweet tea', 'Iced tea'], 'easy', 'starter', 'starter:9521c49b284c2e6fab09f583f3925d7d'),
  ('food', 'Which fruit is called the ''King of Fruits'' in Southeast Asia?', 'Durian', array['Mangosteen', 'Jackfruit', 'Rambutan'], 'easy', 'starter', 'starter:01b8c8be922c3e211f855da9b4d5f0f7'),
  ('food', 'Kimchi is a traditional dish from which country?', 'Korea', array['Japan', 'China', 'Vietnam'], 'easy', 'starter', 'starter:3a4051bade8fa1802f44acd3b48c31cf'),
  ('food', 'What is tofu made from?', 'Soybeans', array['Rice', 'Wheat', 'Coconut'], 'easy', 'starter', 'starter:11ee366700dd7514c14043bcbc8b0c58'),
  ('food', 'Which is the most expensive spice by weight?', 'Saffron', array['Vanilla', 'Cardamom', 'Cinnamon'], 'medium', 'starter', 'starter:db35112d14dd99c2b5f84a40136cf80b'),
  ('food', 'Classic Italian ''mozzarella di bufala'' is made from which animal''s milk?', 'Water buffalo', array['Goat', 'Sheep', 'Yak'], 'medium', 'starter', 'starter:57f24e978f7fae5454467009733b5158'),
  ('food', 'The croissant is most associated with which country?', 'France', array['Italy', 'Germany', 'Belgium'], 'easy', 'starter', 'starter:d6fd9efe6e8aac125c44b9bbbe88314b'),
  ('food', 'Tequila is made from which plant?', 'Blue agave', array['Sugar cane', 'Potato', 'Corn'], 'medium', 'starter', 'starter:598502fbacdef1f712998ad1b52082c8'),
  ('food', 'Pho is a noodle soup from which country?', 'Vietnam', array['Thailand', 'Cambodia', 'Laos'], 'easy', 'starter', 'starter:a0c2121027b3d5ef72b95f0041951e3b'),
  ('food', 'Marzipan is made mainly from which nut?', 'Almond', array['Hazelnut', 'Walnut', 'Peanut'], 'medium', 'starter', 'starter:6a476b82ce8ba87c02796d86fb9909d2'),
  ('food', 'Chocolate is made from the beans of which tree?', 'Cacao', array['Coffee', 'Carob', 'Vanilla'], 'easy', 'starter', 'starter:5a4f7297e34bd2eabf47ae4fa3557856'),
  ('food', 'Swedish meatballs are traditionally served with which jam?', 'Lingonberry', array['Strawberry', 'Raspberry', 'Blackcurrant'], 'easy', 'starter', 'starter:6cf7a70c434acee0dbe7cadc50912dfe'),
  ('food', 'Wasabi is in the same plant family as which of these?', 'Horseradish', array['Ginger', 'Mint', 'Garlic'], 'medium', 'starter', 'starter:4070aa864a1527a01285db5d99f2407d'),
  ('food', 'In Malaysia, roti canai is most often served with…', 'Dhal or curry', array['Honey', 'Soy sauce', 'Strawberry jam'], 'easy', 'starter', 'starter:04e0065a2a79162fb1094e4ddf5f65a4'),
  ('food', 'Pebre, a Chilean salsa, is mainly made from…', 'Tomato, onion, coriander and chilli', array['Avocado and lime', 'Mango and pepper', 'Beans and cheese'], 'medium', 'starter', 'starter:e61f948761383e44aa97e74f9b0a4df7'),
  ('food', 'Traditional Japanese sake is brewed from which grain?', 'Rice', array['Barley', 'Wheat', 'Corn'], 'easy', 'starter', 'starter:22881a656d6732f1917158cce28d731a'),
  ('music', 'How many keys does a standard piano have?', '88', array['76', '92', '64'], 'medium', 'starter', 'starter:fddade26ecbc364387b022d2b3d41170'),
  ('music', 'Who is known as the ''King of Pop''?', 'Michael Jackson', array['Elvis Presley', 'Prince', 'Justin Timberlake'], 'easy', 'starter', 'starter:35b026455d6b764109261e9add6df872'),
  ('music', 'The Beatles came from which city?', 'Liverpool', array['London', 'Manchester', 'Birmingham'], 'easy', 'starter', 'starter:beaffdc02f3fa45272a4898e8d66e424'),
  ('music', 'Which famous composer kept composing after losing his hearing?', 'Ludwig van Beethoven', array['Wolfgang Amadeus Mozart', 'Johann Sebastian Bach', 'Frédéric Chopin'], 'easy', 'starter', 'starter:9c3c580484f7e70651755a491b53d934'),
  ('music', 'Which instrument usually has 47 strings and 7 pedals?', 'Concert harp', array['Piano', 'Cello', 'Sitar'], 'hard', 'starter', 'starter:714e88199b9514221c54f8f02367b3cb'),
  ('music', 'Who was the lead singer of Queen?', 'Freddie Mercury', array['Brian May', 'Mick Jagger', 'David Bowie'], 'easy', 'starter', 'starter:c91a08c739126e61045411a08e52f321'),
  ('music', 'How many lines are there in a musical staff?', '5', array['4', '6', '7'], 'medium', 'starter', 'starter:3afd6104ebff2e634291c13b39371aaf'),
  ('music', 'In which language is most of ''Despacito'' sung?', 'Spanish', array['Portuguese', 'Italian', 'French'], 'easy', 'starter', 'starter:44d100acc159e1d29ecc8e8249ab8272'),
  ('music', 'The sape, a traditional lute, comes from which region?', 'Borneo', array['Java', 'Bali', 'Thailand'], 'easy', 'starter', 'starter:5432036ac0f86ff522f0a6a86d29a274'),
  ('music', 'The DJ and producer Avicii came from which country?', 'Sweden', array['Norway', 'Denmark', 'Netherlands'], 'easy', 'starter', 'starter:b6f2f3fa806b95ec96f815c4c6ddc3ad'),
  ('music', 'Which K-pop group released the song ''Dynamite'' in 2020?', 'BTS', array['Blackpink', 'EXO', 'Twice'], 'easy', 'starter', 'starter:d2e92532eaa2b4fe80d2d882d95df039'),
  ('music', 'In which country was Mozart born?', 'Austria', array['Germany', 'Italy', 'Hungary'], 'medium', 'starter', 'starter:a7c6709e3e0a99110d0eb65179bb8f15'),
  ('music', 'Who is known as the ''Queen of Soul''?', 'Aretha Franklin', array['Whitney Houston', 'Diana Ross', 'Tina Turner'], 'medium', 'starter', 'starter:c1bc28441d4b203a9e1e6d9eca303779'),
  ('music', 'Which Swedish songwriter co-wrote many hits for Britney Spears and Taylor Swift?', 'Max Martin', array['Avicii', 'Björn Ulvaeus', 'Alesso'], 'medium', 'starter', 'starter:0ef61cb4f8e001dd4a01b261a2ae9c46'),
  ('music', 'In music, what does ''tempo'' describe?', 'Speed', array['Loudness', 'Pitch', 'Key'], 'easy', 'starter', 'starter:f1f1d954ba5d17dddc83fd14fc678795'),
  ('music', 'Bob Marley is best known for which kind of music?', 'Reggae', array['Jazz', 'Blues', 'Salsa'], 'easy', 'starter', 'starter:0623d63bad0eb67529d085d053c4686a'),
  ('music', 'How many members did ABBA have?', '4', array['3', '5', '2'], 'easy', 'starter', 'starter:9300671a0d4fa2cf5eadd3c84817620e'),
  ('music', 'Which Chilean singer-songwriter wrote ''Gracias a la vida''?', 'Violeta Parra', array['Víctor Jara', 'Mercedes Sosa', 'Gabriela Mistral'], 'hard', 'starter', 'starter:ec143eff0d711f0b1d981e59505a2bd8'),
  ('music', 'Which Malaysian singer is famous for the song ''Cindai''?', 'Siti Nurhaliza', array['Yuna', 'Zee Avi', 'Sheila Majid'], 'medium', 'starter', 'starter:24f1a9c4f9920380b54979b353d2b242'),
  ('music', 'Which band released the album ''Abbey Road''?', 'The Beatles', array['Queen', 'The Rolling Stones', 'Pink Floyd'], 'easy', 'starter', 'starter:9f81f96fdebb72f4e11db5ac331d6dc9'),
  ('movies', 'In which film do Jack and Rose fall in love on a doomed ship?', 'Titanic', array['The Notebook', 'Pearl Harbor', 'Atonement'], 'easy', 'starter', 'starter:66ec384d635bc7b18e385357101ba3e2'),
  ('movies', 'Which was the first non-English-language film to win the Oscar for Best Picture?', 'Parasite', array['Roma', 'Amélie', 'Crouching Tiger, Hidden Dragon'], 'medium', 'starter', 'starter:ac3af5ad5851091944e3c25e1e2a36aa'),
  ('movies', 'Which Studio Ghibli film features a giant Catbus?', 'My Neighbor Totoro', array['Spirited Away', 'Ponyo', 'Kiki''s Delivery Service'], 'easy', 'starter', 'starter:a359c6f2ba7438e1b5ab3e342ddbbe1c'),
  ('movies', 'Who directed ''Jurassic Park''?', 'Steven Spielberg', array['James Cameron', 'George Lucas', 'Ridley Scott'], 'easy', 'starter', 'starter:b7b37d98ae08ffd964b70f78c38748bc'),
  ('movies', 'Which school does Harry Potter attend?', 'Hogwarts', array['Beauxbatons', 'Durmstrang', 'Brakebills'], 'easy', 'starter', 'starter:e9d46dc7ae58c2e1e6ec3de1ea7e51a5'),
  ('movies', 'In ''Finding Nemo'', what kind of fish is Nemo?', 'Clownfish', array['Goldfish', 'Angelfish', 'Blue tang'], 'easy', 'starter', 'starter:229fbd41e8cf6425fe5033ebae09a10c'),
  ('movies', 'In ''Black Panther'', what is the name of T''Challa''s country?', 'Wakanda', array['Genovia', 'Zamunda', 'Latveria'], 'easy', 'starter', 'starter:378117406f860e084241df7dd8cb5c5d'),
  ('movies', 'Which series is set in the town of Hawkins, Indiana?', 'Stranger Things', array['Riverdale', 'Twin Peaks', 'Wednesday'], 'easy', 'starter', 'starter:589b00a18ba9bed605c93dbe6b5d14e6'),
  ('movies', '''Squid Game'' comes from which country?', 'South Korea', array['Japan', 'China', 'Thailand'], 'easy', 'starter', 'starter:65eee4e911b41c11b84135893b5b7b29'),
  ('movies', 'The ''Lord of the Rings'' films were mostly filmed in which country?', 'New Zealand', array['Ireland', 'Canada', 'Iceland'], 'easy', 'starter', 'starter:9637144e5f418fb66cd10e7aec74f644'),
  ('movies', 'Which Disney film is set in the kingdom of Arendelle?', 'Frozen', array['Tangled', 'Moana', 'Brave'], 'easy', 'starter', 'starter:2a7cb5349320bcf507ce710642199161'),
  ('movies', 'Who played Iron Man in the Marvel films?', 'Robert Downey Jr.', array['Chris Evans', 'Chris Hemsworth', 'Mark Ruffalo'], 'easy', 'starter', 'starter:0b7c47ae3e4b36b6b56b2c572543cb8d'),
  ('movies', 'In ''Friends'', what is the name of the coffee shop?', 'Central Perk', array['Java Joe''s', 'The Daily Grind', 'Monica''s'], 'medium', 'starter', 'starter:64552bf08aa9cfa1d58fd55e64bfbeaf'),
  ('movies', 'Which Swedish actress starred in ''Casablanca''?', 'Ingrid Bergman', array['Greta Garbo', 'Alicia Vikander', 'Noomi Rapace'], 'medium', 'starter', 'starter:087af67af897defebf68fdc423580e55'),
  ('movies', 'Which Swedish director made ''The Seventh Seal''?', 'Ingmar Bergman', array['Lasse Hallström', 'Ruben Östlund', 'Roy Andersson'], 'hard', 'starter', 'starter:2e4481101dc678c6b96ca9998a37d027'),
  ('movies', 'Which Malaysian actress won the Oscar for Best Actress in 2023?', 'Michelle Yeoh', array['Gemma Chan', 'Constance Wu', 'Awkwafina'], 'medium', 'starter', 'starter:67cbfc59833dde9871b5d745392de748'),
  ('movies', '''The Sound of Music'' is set in which country?', 'Austria', array['Switzerland', 'Germany', 'Norway'], 'medium', 'starter', 'starter:f65bf7192aa3fc7d2dc165e37dfc0121'),
  ('movies', 'Which Pixar film takes place inside a girl''s mind, among her emotions?', 'Inside Out', array['Soul', 'Coco', 'Up'], 'easy', 'starter', 'starter:726d8c2f222d68368a262a00d62e5c9b'),
  ('movies', '''May the Force be with you'' comes from which film series?', 'Star Wars', array['Star Trek', 'The Matrix', 'Dune'], 'easy', 'starter', 'starter:aaadaf58286163f9b62ae0bf3b8d9a39'),
  ('movies', 'Which series follows a young chess prodigy in the 1950s and 60s?', 'The Queen''s Gambit', array['The Crown', 'Mad Men', 'Bridgerton'], 'easy', 'starter', 'starter:b7d8d60ce7b381848af55968c503ad41'),
  ('sport', 'How often are the Summer Olympic Games usually held?', 'Every 4 years', array['Every 2 years', 'Every 3 years', 'Every 5 years'], 'easy', 'starter', 'starter:98b12c78f024b9eed5d74ea5507efef7'),
  ('sport', 'Which country has won the most FIFA World Cups?', 'Brazil', array['Germany', 'Italy', 'Argentina'], 'easy', 'starter', 'starter:cbd118d696110c7a713321c7bb688573'),
  ('sport', 'In tennis, what does ''love'' mean?', 'Zero', array['A tie', 'A winning shot', 'A serve'], 'easy', 'starter', 'starter:b349ee0f2fa2727d77fa745fd8df1a5e'),
  ('sport', 'Which Malaysian badminton player won three Olympic silver medals?', 'Lee Chong Wei', array['Lee Zii Jia', 'Misbun Sidek', 'Nicol David'], 'medium', 'starter', 'starter:f52084fabe803e8af0a7e3360f69df76'),
  ('sport', 'How many rings are on the Olympic flag?', '5', array['4', '6', '7'], 'easy', 'starter', 'starter:53a4fe2c34eb1fd416fbdc4726d2904b'),
  ('sport', 'In sepak takraw, players may NOT touch the ball with their…', 'Hands', array['Feet', 'Knees', 'Head'], 'easy', 'starter', 'starter:38e1549a1b7beaa652a4fef441a5aa15'),
  ('sport', 'Footballer Zlatan Ibrahimović played for which national team?', 'Sweden', array['Norway', 'Croatia', 'Serbia'], 'easy', 'starter', 'starter:feeeb12971e5f655c29f9221268525d7'),
  ('sport', 'Which country hosted the 2016 Summer Olympics?', 'Brazil', array['China', 'United Kingdom', 'Japan'], 'easy', 'starter', 'starter:dcc7469b9778d719a3775b65d1da6903'),
  ('sport', 'How long is a marathon?', '42.195 km', array['40 km', '26 km', '50 km'], 'medium', 'starter', 'starter:3d78ee9e68b451b8248d5773330dd220'),
  ('sport', 'Which sport uses a shuttlecock?', 'Badminton', array['Squash', 'Table tennis', 'Volleyball'], 'easy', 'starter', 'starter:3c7b3c0b15d63dd2ecbe00a7359cb3e6'),
  ('sport', 'In golf, what is one stroke under par called?', 'Birdie', array['Eagle', 'Bogey', 'Albatross'], 'medium', 'starter', 'starter:f37b1b36922eaf866377dd770f345fc0'),
  ('sport', 'Swedish tennis star Björn Borg won which tournament five years in a row?', 'Wimbledon', array['US Open', 'French Open', 'Australian Open'], 'medium', 'starter', 'starter:0bf7182a23b0da08c8dbc9ff0fa2ae51'),
  ('sport', 'How many players from each team are on a basketball court?', '5', array['6', '7', '11'], 'easy', 'starter', 'starter:7128ab558669abfac4c3b1f7eb36e10a'),
  ('sport', 'Chile won the Copa América in which years?', '2015 and 2016', array['2010 and 2011', '2019 and 2021', 'Chile has never won it'], 'hard', 'starter', 'starter:d93deebcfcb92ff990d2f4b88b29e018'),
  ('sport', 'How long is a football (soccer) match in regular time?', '90 minutes', array['80 minutes', '100 minutes', '60 minutes'], 'easy', 'starter', 'starter:1e3189ffacd8bbae7ec654527194bf31'),
  ('sport', 'Which country is the birthplace of modern ice hockey?', 'Canada', array['Sweden', 'Russia', 'Finland'], 'medium', 'starter', 'starter:b5f870deb90fdaf0f677d8f03772c3f6'),
  ('sport', 'Sprinter Usain Bolt comes from which country?', 'Jamaica', array['United States', 'Kenya', 'Trinidad and Tobago'], 'easy', 'starter', 'starter:4fbb5c554a398aa0aabb3b42fde82c5c'),
  ('sport', 'At which circuit was the Malaysian Formula 1 Grand Prix held?', 'Sepang', array['Marina Bay', 'Suzuka', 'Shanghai'], 'medium', 'starter', 'starter:158eae9d88ba6eef877e9ebf7f3f5903'),
  ('sport', 'How many points is a touchdown worth in American football?', '6', array['3', '7', '5'], 'medium', 'starter', 'starter:75ff8b7fa7bbecc7078366441ab27765'),
  ('sport', 'In which sport would you do a ''slam dunk''?', 'Basketball', array['Volleyball', 'Netball', 'Handball'], 'easy', 'starter', 'starter:181755c641edc01ab93a060e557da61a'),
  ('words', 'What does ''terima kasih'' mean in Malay?', 'Thank you', array['Good morning', 'You''re welcome', 'Goodbye'], 'easy', 'starter', 'starter:6d3d7ddc7f1433750cc060b61c538924'),
  ('words', 'What does ''tack'' mean in Swedish?', 'Thank you', array['Hello', 'Goodbye', 'Please'], 'easy', 'starter', 'starter:9e156321b0a9c94625f3ee9e6bf314f1'),
  ('words', '''Gracias'' means thank you in which language?', 'Spanish', array['Italian', 'Portuguese', 'French'], 'easy', 'starter', 'starter:3451d44df4696af966a9d4fec67b41a5'),
  ('words', 'In Iban, what does ''Nama berita?'' mean?', 'How are you?', array['What''s your name?', 'Where are you going?', 'Have you eaten?'], 'medium', 'starter', 'starter:e28ebc75d1402b4353601230644d7070'),
  ('words', 'What does ''hej'' mean in Swedish?', 'Hi', array['Bye', 'Yes', 'Thanks'], 'easy', 'starter', 'starter:7acef12003574035d1167bdf025ba078'),
  ('words', 'What is a word or phrase that reads the same backwards called?', 'Palindrome', array['Anagram', 'Homonym', 'Acronym'], 'medium', 'starter', 'starter:0942eebee1a50036ccb00206cb7d4f8f'),
  ('words', 'Which of these letters is in the Swedish alphabet but not the English one?', 'Å', array['Ñ', 'Ç', 'ß'], 'easy', 'starter', 'starter:7d7c4489e88e93978bae7f4dacbe33f6'),
  ('words', 'What does ''te quiero'' mean in Spanish?', 'I love you', array['I miss you', 'I''m hungry', 'See you soon'], 'easy', 'starter', 'starter:ba190a1b60dee0c0a1103fe7f893ceff'),
  ('words', 'What does ''jag älskar dig'' mean in Swedish?', 'I love you', array['I miss you', 'Good night', 'Have a nice day'], 'easy', 'starter', 'starter:8c3dd35ac2bff8dcb28986b036a66958'),
  ('words', 'What does ''sayang'' mean in Malay?', 'Darling / love', array['Goodbye', 'Friend', 'Sorry'], 'easy', 'starter', 'starter:249ae25304d12ba9ba68c4419d8931d1'),
  ('words', 'What is a Swedish ''smörgåsbord''?', 'A buffet of many dishes', array['A single sandwich', 'A cheese knife', 'A breakfast porridge'], 'medium', 'starter', 'starter:668e93442649c9759aca8d5bb40cc7c9'),
  ('words', 'The English word ''ombudsman'' comes from which language?', 'Swedish', array['German', 'Dutch', 'Latin'], 'hard', 'starter', 'starter:3d051c367e9f9f7adf1bc8f1b379121e'),
  ('words', 'What is the Spanish word for ''heart''?', 'Corazón', array['Cabeza', 'Cielo', 'Corona'], 'easy', 'starter', 'starter:ea6956a2a45c4e266e7386848b56791e'),
  ('words', 'In Chilean Spanish slang, what does ''¿cachai?'' mean?', 'Do you get it?', array['How much?', 'Are you hungry?', 'Let''s go!'], 'medium', 'starter', 'starter:6171c93e2f7001873956204572dd0a04'),
  ('words', 'Which language is spoken in Brazil?', 'Portuguese', array['Spanish', 'Brazilian', 'French'], 'easy', 'starter', 'starter:4b2fe4a66bb50490c60c3bd25c1d47f2'),
  ('words', 'The English phrase ''run amok'' comes from which language?', 'Malay', array['Hindi', 'Arabic', 'Swahili'], 'hard', 'starter', 'starter:dab76d64d411adf904c4be368a4e4e4d'),
  ('words', 'Which Swedish word means ''cosy''?', 'Mysig', array['Lagom', 'Fika', 'Hej'], 'medium', 'starter', 'starter:a3886d394660d1c44ec0a5e0a0072132'),
  ('words', 'What does ''selamat pagi'' mean in Malay?', 'Good morning', array['Good night', 'Welcome', 'Happy birthday'], 'easy', 'starter', 'starter:5ad0768ea86ccf2a120510a9cf46fa48'),
  ('words', 'How do you say ''goodbye'' in Spanish?', 'Adiós', array['Hola', 'Por favor', 'Buenas'], 'easy', 'starter', 'starter:e481f55b645824f3d0a29a850dae27e4'),
  ('words', 'What does ''god natt'' mean in Swedish?', 'Good night', array['Good luck', 'Good morning', 'Well done'], 'easy', 'starter', 'starter:6bab63eba4e69580215309d32af248c8'),
  ('animals', 'What is the largest animal that has ever lived?', 'Blue whale', array['African elephant', 'Megalodon', 'Brachiosaurus'], 'easy', 'starter', 'starter:bb6f792ca0baa6924bff8b41698da453'),
  ('animals', 'What is the fastest land animal?', 'Cheetah', array['Lion', 'Horse', 'Pronghorn'], 'easy', 'starter', 'starter:2f5c0af72c47bffa6c45078d024253e5'),
  ('animals', 'What is a group of lions called?', 'A pride', array['A pack', 'A herd', 'A school'], 'easy', 'starter', 'starter:6f280ed55822c441973476f1e8227e93'),
  ('animals', 'Which of these birds cannot fly?', 'Penguin', array['Puffin', 'Hornbill', 'Eagle'], 'easy', 'starter', 'starter:e039428a415e975f80877c1ef31e5ecd'),
  ('animals', 'What do puffins mainly eat?', 'Small fish', array['Seeds', 'Insects', 'Berries'], 'easy', 'starter', 'starter:0c1f580160be2caef0ffcad0ea69930e'),
  ('animals', 'Which is the only mammal that can truly fly?', 'Bat', array['Flying squirrel', 'Sugar glider', 'Colugo'], 'easy', 'starter', 'starter:c336f93f688771305dc5e415c5b364d9'),
  ('animals', 'How many legs does a spider have?', '8', array['6', '10', '12'], 'easy', 'starter', 'starter:1085ad93868a7922b3471e4903605752'),
  ('animals', 'The proboscis monkey of Borneo is famous for its…', 'Large nose', array['Blue face', 'Long tail used as a hand', 'Striped fur'], 'easy', 'starter', 'starter:d12b55c8a2f5350e285884a0361f1a34'),
  ('animals', 'Sweden''s ''king of the forest'' (älg) is which animal?', 'Moose', array['Brown bear', 'Wolf', 'Reindeer'], 'medium', 'starter', 'starter:8ef9236dbc318a55d91634b32c6e9c42'),
  ('animals', 'The pudú, the world''s smallest deer, lives in…', 'Chile and Argentina', array['Borneo', 'Sweden', 'Madagascar'], 'hard', 'starter', 'starter:07f52ed8fdaca3e2634d06eb6f79f409'),
  ('animals', 'What is the largest living lizard?', 'Komodo dragon', array['Iguana', 'Monitor lizard', 'Gila monster'], 'easy', 'starter', 'starter:e148cfa7a2b70f956732c2612387cdc6'),
  ('animals', 'Which animal is called the ''ship of the desert''?', 'Camel', array['Horse', 'Donkey', 'Ostrich'], 'easy', 'starter', 'starter:89012e6d24fed85dc45214a8782609b2'),
  ('animals', 'Which land animal is known for living longest?', 'Giant tortoise', array['Elephant', 'Parrot', 'Bear'], 'medium', 'starter', 'starter:0a65dabd2c997a8fcca577670c78e84d'),
  ('animals', 'What do giant pandas mainly eat?', 'Bamboo', array['Fish', 'Fruit', 'Insects'], 'easy', 'starter', 'starter:9e8cd880ffdc64d9dc825e231bfd27a1'),
  ('animals', 'What is a baby kangaroo called?', 'Joey', array['Cub', 'Kid', 'Pup'], 'easy', 'starter', 'starter:5ae51af400da97a100fb41f1ec32f5db'),
  ('animals', 'On which island do pygmy elephants live?', 'Borneo', array['Sumatra', 'Sri Lanka', 'Madagascar'], 'medium', 'starter', 'starter:52215e18d6d804b9ce8efaf870ff5ea9'),
  ('animals', 'The Andean condor is a type of…', 'Vulture', array['Eagle', 'Parrot', 'Owl'], 'medium', 'starter', 'starter:9c41920b044e894ec075925a32807025'),
  ('animals', 'Which of these mammals lays eggs?', 'Platypus', array['Koala', 'Sloth', 'Otter'], 'medium', 'starter', 'starter:98ce4618d63ad2202406c867926caf79'),
  ('animals', 'Which bird can fly backwards?', 'Hummingbird', array['Sparrow', 'Owl', 'Pelican'], 'medium', 'starter', 'starter:2e7ab4a2fe5433d1fccb1ec3d562b7d2'),
  ('animals', 'While nesting, female hornbills seal themselves inside a…', 'Tree hollow', array['Underground burrow', 'Floating nest', 'Cave'], 'hard', 'starter', 'starter:c6362c54b6c68d1435a87e58ef4102e6'),
  ('art_books', 'Who painted ''The Starry Night''?', 'Vincent van Gogh', array['Claude Monet', 'Pablo Picasso', 'Salvador Dalí'], 'easy', 'starter', 'starter:e3f6bbccf01424f01e262eec6d8b0aca'),
  ('art_books', 'Who wrote ''Romeo and Juliet''?', 'William Shakespeare', array['Charles Dickens', 'Jane Austen', 'Oscar Wilde'], 'easy', 'starter', 'starter:572cff85cf3419f198548619a704cf58'),
  ('art_books', 'Who wrote the ''Harry Potter'' books?', 'J.K. Rowling', array['Roald Dahl', 'C.S. Lewis', 'Philip Pullman'], 'easy', 'starter', 'starter:42f0ccf1d4f1703550a6fa774e41540b'),
  ('art_books', 'In which city is the Louvre museum?', 'Paris', array['Rome', 'London', 'Madrid'], 'easy', 'starter', 'starter:677dc8892ee8a9ee789b432e67095e9a'),
  ('art_books', 'Who sculpted the statue of David in Florence?', 'Michelangelo', array['Donatello', 'Bernini', 'Rodin'], 'easy', 'starter', 'starter:15c6037389c6c5c37b8a9915dca10ef9'),
  ('art_books', 'Who wrote ''Pride and Prejudice''?', 'Jane Austen', array['Charlotte Brontë', 'Emily Dickinson', 'Virginia Woolf'], 'easy', 'starter', 'starter:39de8b0e0fc7929d2143f65ab49e058b'),
  ('art_books', 'The painter Frida Kahlo came from which country?', 'Mexico', array['Spain', 'Argentina', 'Cuba'], 'easy', 'starter', 'starter:fbaf389cd7fe60e34e765a855e464347'),
  ('art_books', 'Who wrote ''The Little Prince''?', 'Antoine de Saint-Exupéry', array['Victor Hugo', 'Jules Verne', 'Albert Camus'], 'medium', 'starter', 'starter:80ce28ead5d093446cad760c4be64e30'),
  ('art_books', 'What are the three traditional primary colours in painting?', 'Red, yellow and blue', array['Red, green and blue', 'Black, white and grey', 'Orange, green and purple'], 'easy', 'starter', 'starter:fae835f9a9b366bbb95bdf0ebe6b799e'),
  ('art_books', 'Who painted ''The Scream''?', 'Edvard Munch', array['Vincent van Gogh', 'Gustav Klimt', 'René Magritte'], 'medium', 'starter', 'starter:9e3292f902daa3f5c98e5ff4894b127b'),
  ('art_books', 'Who wrote ''The Girl with the Dragon Tattoo''?', 'Stieg Larsson', array['Jo Nesbø', 'Henning Mankell', 'Camilla Läckberg'], 'medium', 'starter', 'starter:76f015e0c901d9fdb899ff414f87501e'),
  ('art_books', 'Who wrote ''One Hundred Years of Solitude''?', 'Gabriel García Márquez', array['Pablo Neruda', 'Isabel Allende', 'Jorge Luis Borges'], 'medium', 'starter', 'starter:ed1b5088853e5f4af028deab6148ec25'),
  ('art_books', 'Isabel Allende, author of ''The House of the Spirits'', is a writer from…', 'Chile', array['Mexico', 'Colombia', 'Spain'], 'medium', 'starter', 'starter:7f973bea08a439eb58e30c542e3fab94'),
  ('art_books', 'What is pua kumbu?', 'A traditional Iban woven textile', array['A type of drum', 'A rice wine', 'A wood carving'], 'medium', 'starter', 'starter:da43cec30ecae5f4db8bbb5398e474f7'),
  ('art_books', 'Pablo Picasso helped create which art style?', 'Cubism', array['Impressionism', 'Surrealism', 'Pop art'], 'medium', 'starter', 'starter:9dc775b5dd9949c5f9d3df74967433b1'),
  ('art_books', 'What is the Japanese art of paper folding called?', 'Origami', array['Ikebana', 'Bonsai', 'Kintsugi'], 'easy', 'starter', 'starter:47a050dd5c4f1a2d91d6119680d467d2'),
  ('art_books', 'Who wrote ''Don Quixote''?', 'Miguel de Cervantes', array['Lope de Vega', 'Federico García Lorca', 'Gabriel García Márquez'], 'medium', 'starter', 'starter:5cf45a71c56ef42a7d759cb72fd52030'),
  ('art_books', 'Which Swedish author wrote ''The Wonderful Adventures of Nils''?', 'Selma Lagerlöf', array['Astrid Lindgren', 'August Strindberg', 'Tove Jansson'], 'hard', 'starter', 'starter:1043870933c8ecccae6554567e9295c9'),
  ('art_books', 'In which museum does the Mona Lisa hang?', 'The Louvre', array['The Uffizi', 'The Prado', 'The British Museum'], 'easy', 'starter', 'starter:6a7635665b04f68816eddf899f1f138a'),
  ('art_books', 'Fairy-tale writer Hans Christian Andersen came from which country?', 'Denmark', array['Sweden', 'Norway', 'Germany'], 'medium', 'starter', 'starter:b161c2a7e17a85bc83404feaae3d7de8'),
  ('technology', 'What does ''CPU'' stand for?', 'Central Processing Unit', array['Computer Power Unit', 'Central Program Utility', 'Core Processing Unit'], 'easy', 'starter', 'starter:44ea57e503459b6a86d35b63634b60f5'),
  ('technology', 'Who co-founded Apple with Steve Wozniak?', 'Steve Jobs', array['Bill Gates', 'Elon Musk', 'Jeff Bezos'], 'easy', 'starter', 'starter:38d6d6d85ddce8972eab7df315020022'),
  ('technology', 'Who co-founded Microsoft with Paul Allen?', 'Bill Gates', array['Steve Jobs', 'Larry Page', 'Mark Zuckerberg'], 'easy', 'starter', 'starter:126fa079fc6e67d7a63b0466d36c3713'),
  ('technology', 'What does ''URL'' stand for?', 'Uniform Resource Locator', array['Universal Root Link', 'User Resource Line', 'Unified Reference Language'], 'medium', 'starter', 'starter:4fa4f7f0fbb61ee5eb7a29110f38a89e'),
  ('technology', 'In which year was the first iPhone released?', '2007', array['2005', '2009', '2010'], 'easy', 'starter', 'starter:8ea6e1d6c3033e850201046cd96d716a'),
  ('technology', 'Which company makes the Android operating system?', 'Google', array['Apple', 'Samsung', 'Microsoft'], 'easy', 'starter', 'starter:82eda761d98f3d66a347e325240dcba7'),
  ('technology', 'Who invented the World Wide Web?', 'Tim Berners-Lee', array['Bill Gates', 'Alan Turing', 'Steve Jobs'], 'medium', 'starter', 'starter:9ffa96cbc648f3b960304e33f5f2ce05'),
  ('technology', 'Bluetooth is named after…', 'A Viking king, Harald Bluetooth', array['A blue whale', 'Its inventor, Mr Blue', 'A blue tooth emoji'], 'medium', 'starter', 'starter:ca8a183e15e5cd82fee42dc68d37ef41'),
  ('technology', 'Skype co-founder Niklas Zennström comes from which country?', 'Sweden', array['Estonia', 'Denmark', 'Finland'], 'hard', 'starter', 'starter:2d58cdfda389a4298b476fd47167050e'),
  ('technology', 'Which two digits does binary code use?', '0 and 1', array['1 and 2', '0 and 9', '1 and 10'], 'easy', 'starter', 'starter:5f6a8d8c98f21e610d3c5df1665d7b3e'),
  ('technology', 'What does ''AI'' stand for?', 'Artificial intelligence', array['Automatic internet', 'Advanced interface', 'Applied information'], 'easy', 'starter', 'starter:afb92e5ec80059159e05ddd43c9774ec'),
  ('technology', 'How many bits are in a byte?', '8', array['4', '16', '10'], 'medium', 'starter', 'starter:964ce78657f86aa1d296852746ca9a80'),
  ('technology', 'Minecraft was created by which Swedish company?', 'Mojang', array['King', 'DICE', 'Spotify'], 'medium', 'starter', 'starter:85a15fe81ef1cc748fc8433f0e8f9fa4'),
  ('technology', 'What does ''GPS'' stand for?', 'Global Positioning System', array['General Path Service', 'Geographic Pin System', 'Global Phone Signal'], 'medium', 'starter', 'starter:9c15798410261d1d71530e83093a8f0e'),
  ('technology', 'Who is often called the ''father of the computer''?', 'Charles Babbage', array['Thomas Edison', 'Alan Turing', 'Nikola Tesla'], 'medium', 'starter', 'starter:3647195758502d2120865a8b2ba7984f'),
  ('technology', 'Which short-video app is owned by ByteDance?', 'TikTok', array['Instagram', 'Snapchat', 'YouTube'], 'easy', 'starter', 'starter:cbed5c001162ecb19f300bf18e277954'),
  ('technology', 'What is the name of Apple''s voice assistant?', 'Siri', array['Alexa', 'Cortana', 'Bixby'], 'easy', 'starter', 'starter:8e4e322f0a6e618305ae9760de99c5c4'),
  ('technology', 'What does ''PDF'' stand for?', 'Portable Document Format', array['Printed Document File', 'Personal Data Form', 'Public Document Folder'], 'medium', 'starter', 'starter:24e0885895c758d3929fbdd5566b1837'),
  ('technology', 'Who is often called the first computer programmer?', 'Ada Lovelace', array['Grace Hopper', 'Marie Curie', 'Hedy Lamarr'], 'medium', 'starter', 'starter:fac86aa4b36f3c04749cbe1d85bf1d82'),
  ('technology', 'Which company makes the PlayStation?', 'Sony', array['Nintendo', 'Microsoft', 'Sega'], 'easy', 'starter', 'starter:8fb6dd12b1343d1c0f7863595d193c0a')
on conflict (external_key) do nothing;

-- ------------------------------------------------ Open Trivia DB import (optional, one time)
-- Run supabase/quiz_import_schedule.sql once to start it. Every 15 seconds the
-- database asks opentdb.com for 50 more multiple-choice questions (their limit is
-- one request per 5 seconds), adds the ones that fit your categories, and switches
-- itself off when the collection is exhausted (about half an hour). Only question
-- text is fetched; nothing about you is sent. Questions: Open Trivia DB, CC BY-SA 4.0.
create table public.quiz_import_state (
  id          int primary key default 1 check (id = 1),
  token       text,
  request_id  bigint,
  phase       text not null default 'token' check (phase in ('token', 'questions', 'done')),
  imported    int not null default 0,
  requests    int not null default 0,
  updated_at  timestamptz not null default now()
);
alter table public.quiz_import_state enable row level security;
revoke all on public.quiz_import_state from anon, authenticated;

create or replace function public.opentdb_category(p_name text)
returns text language sql immutable set search_path = '' as $$
  select case p_name
    when 'General Knowledge' then 'general'
    when 'Entertainment: Books' then 'art_books'
    when 'Art' then 'art_books'
    when 'Entertainment: Film' then 'movies'
    when 'Entertainment: Television' then 'movies'
    when 'Entertainment: Music' then 'music'
    when 'Science & Nature' then 'science'
    when 'Science: Mathematics' then 'science'
    when 'Science: Computers' then 'technology'
    when 'Science: Gadgets' then 'technology'
    when 'Sports' then 'sport'
    when 'Geography' then 'geography'
    when 'History' then 'history'
    when 'Animals' then 'animals'
    else null end;     -- the rest (games, anime, celebrities, politics…) are left out
$$;

create or replace function public.opentdb_b64(p text)
returns text language sql immutable set search_path = '' as $$
  select convert_from(decode(p, 'base64'), 'UTF8');
$$;

-- Handles the previous reply (if it has arrived) and sends the next request.
create or replace function public.opentdb_import_step()
returns text language plpgsql security definer set search_path = '' as $$
declare
  s public.quiz_import_state%rowtype;
  resp record;
  j jsonb;
  item jsonb;
  cat text;
  rc int;
  n int := 0;
begin
  insert into public.quiz_import_state (id) values (1) on conflict do nothing;
  select * into s from public.quiz_import_state where id = 1 for update;
  if s.phase = 'done' then return 'done'; end if;

  if s.request_id is not null then
    select status_code, content into resp from net._http_response where id = s.request_id;
    if not found then return 'waiting'; end if;
    if resp.status_code = 200 then
      begin j := resp.content::jsonb; exception when others then j := null; end;
    end if;
    if j is not null and s.phase = 'token' and j ? 'token' then
      update public.quiz_import_state set token = j->>'token', phase = 'questions' where id = 1;
      s.phase := 'questions'; s.token := j->>'token';
    elsif j is not null and s.phase = 'questions' then
      rc := (j->>'response_code')::int;
      if rc = 0 then
        for item in select * from jsonb_array_elements(j->'results') loop
          if public.opentdb_b64(item->>'type') <> 'multiple' then continue; end if;
          cat := public.opentdb_category(public.opentdb_b64(item->>'category'));
          if cat is null then continue; end if;
          insert into public.quiz_questions (category, question, correct, wrong, difficulty, source, external_key)
          select cat, left(public.opentdb_b64(item->>'question'), 400), left(public.opentdb_b64(item->>'correct_answer'), 200),
                 array(select left(public.opentdb_b64(w), 200) from jsonb_array_elements_text(item->'incorrect_answers') w limit 3),
                 coalesce(nullif(public.opentdb_b64(item->>'difficulty'), ''), 'medium'), 'opentdb',
                 'opentdb:' || md5(lower(public.opentdb_b64(item->>'question')))
          where jsonb_array_length(item->'incorrect_answers') = 3
          on conflict (external_key) do nothing;
          get diagnostics rc = row_count; n := n + rc; rc := 0;
        end loop;
      elsif rc = 4 then
        update public.quiz_import_state set phase = 'done', request_id = null, updated_at = now() where id = 1;
        begin perform cron.unschedule('olr-quiz-import'); exception when others then null; end;
        return 'done';
      elsif rc in (2, 3) then
        update public.quiz_import_state set phase = 'token', token = null where id = 1;
        s.phase := 'token';
      end if;   -- 1 (no results) or 5 (too fast): just try again
    end if;
  end if;

  -- send the next request
  update public.quiz_import_state set
    request_id = net.http_get(case when s.phase = 'token' then 'https://opentdb.com/api_token.php?command=request'
                                   else 'https://opentdb.com/api.php?amount=50&encode=base64&token=' || s.token end),
    imported = imported + n, requests = requests + 1, updated_at = now()
   where id = 1;
  return 'imported ' || n;
end;
$$;
revoke execute on function public.opentdb_import_step(), public.opentdb_category(text), public.opentdb_b64(text) from public, anon, authenticated;

-- ------------------------------------------------------ scrapbook: kind 'quiz'
alter table public.scrapbook_entries drop constraint if exists scrapbook_entries_kind_check;
alter table public.scrapbook_entries add constraint scrapbook_entries_kind_check
  check (kind in ('ritual', 'mission', 'letter', 'discovery', 'milestone', 'moment', 'whim', 'quiz'));

create or replace function public.scrapbook_item_ok(p_rel uuid, p_kind text, p_ref uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'ritual'    then exists (select 1 from public.weekly_activities w where w.id = p_ref and w.relationship_id = p_rel) and public.week_revealed(p_ref)
    when 'mission'   then exists (select 1 from public.apart_missions m where m.id = p_ref and m.relationship_id = p_rel) and public.apart_visible(p_ref)
    when 'letter'    then exists (select 1 from public.letters l where l.id = p_ref and l.relationship_id = p_rel and public.letter_arrived(l))
    when 'discovery' then exists (select 1 from public.curious_discoveries d where d.id = p_ref and d.relationship_id = p_rel)
    when 'milestone' then exists (select 1 from public.milestones x where x.id = p_ref and x.relationship_id = p_rel)
    when 'moment'    then exists (select 1 from public.moments x where x.id = p_ref and x.relationship_id = p_rel)
    when 'quiz'      then exists (select 1 from public.quiz_matches x where x.id = p_ref and x.relationship_id = p_rel and x.status = 'finished')
    when 'whim'      then exists (select 1 from public.whims x where x.id = p_ref and x.relationship_id = p_rel and public.whim_came_true(x))
    else false end;
$$;

create or replace function public.set_scrapbook_entry(p_kind text, p_ref uuid, p_saved boolean default true, p_caption text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
  c   text := case when p_caption is null then null else trim(p_caption) end;
begin
  if rel is null then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
  if p_kind not in ('ritual', 'mission', 'letter', 'discovery', 'milestone', 'moment', 'whim', 'quiz') then
    raise exception 'Unknown kind of memory.' using errcode = '22023';
  end if;
  if c is not null and char_length(c) > 300 then
    raise exception 'Please keep captions under 300 characters.' using errcode = '22001';
  end if;
  if not public.scrapbook_item_ok(rel, p_kind, p_ref) then
    raise exception 'That can be saved once it''s open to both of you.' using errcode = 'P0001';
  end if;
  insert into public.scrapbook_entries (relationship_id, kind, ref_id, saved, caption, saved_by)
  values (rel, p_kind, p_ref, coalesce(p_saved, true), coalesce(c, ''), auth.uid())
  on conflict (relationship_id, kind, ref_id) do update
    set saved = coalesce(p_saved, scrapbook_entries.saved),
        caption = coalesce(c, scrapbook_entries.caption),
        saved_by = case when p_saved then auth.uid() else scrapbook_entries.saved_by end,
        updated_at = now();
end;
$$;

create or replace function public.scrapbook_feed()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
begin
  if rel is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x.item order by x.at desc)
      from (
        -- weekly rituals (saved, revealed)
        select w.week_start as at, jsonb_build_object(
                 'kind', 'ritual', 'ref_id', w.id, 'at', w.week_start, 'caption', e.caption,
                 'title', a.title, 'category', a.category, 'week_number', w.week_number,
                 'authors', (select jsonb_agg(s.user_id) from public.activity_submissions s where s.weekly_activity_id = w.id and s.status = 'submitted'),
                 'parts', (select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'body', s.body, 'answers', s.answers, 'link_url', s.link_url,
                                                              'image_path', s.image_path, 'voice_path', s.voice_path, 'voice_seconds', s.voice_seconds))
                             from public.activity_submissions s where s.weekly_activity_id = w.id and s.status = 'submitted')) as item
          from public.scrapbook_entries e
          join public.weekly_activities w on w.id = e.ref_id and w.relationship_id = rel
          join public.activities a on a.id = w.activity_id
         where e.relationship_id = rel and e.kind = 'ritual' and e.saved and public.week_revealed(w.id)
        union all
        -- Apart missions (saved, open to both)
        select m.created_at, jsonb_build_object(
                 'kind', 'mission', 'ref_id', m.id, 'at', m.created_at, 'caption', e.caption, 'title', pa.title, 'category', pa.category,
                 'authors', (select jsonb_agg(distinct en.user_id) from public.apart_entries en where en.mission_id = m.id),
                 'parts', (select jsonb_agg(jsonb_build_object('user_id', en.user_id, 'body', en.body, 'link_url', en.link_url,
                                                              'image_path', en.image_path, 'voice_path', en.voice_path, 'voice_seconds', en.voice_seconds) order by en.created_at)
                             from public.apart_entries en where en.mission_id = m.id))
          from public.scrapbook_entries e
          join public.apart_missions m on m.id = e.ref_id and m.relationship_id = rel
          join public.play_activities pa on pa.id = m.activity_id
         where e.relationship_id = rel and e.kind = 'mission' and e.saved and public.apart_visible(m.id)
        union all
        -- loved letters (automatic)
        select coalesce(l.reveal_at, l.sent_at), jsonb_build_object(
                 'kind', 'letter', 'ref_id', l.id, 'at', coalesce(l.reveal_at, l.sent_at), 'caption', coalesce(e.caption, ''),
                 'title', l.title, 'letter_kind', l.kind, 'authors', jsonb_build_array(l.sender_id),
                 'parts', jsonb_build_array(jsonb_build_object('user_id', l.sender_id, 'body', l.body, 'image_path', l.image_path,
                                                               'voice_path', l.voice_path, 'voice_seconds', l.voice_seconds)))
          from public.letters l
          left join public.scrapbook_entries e on e.relationship_id = rel and e.kind = 'letter' and e.ref_id = l.id
         where l.relationship_id = rel and l.loved and public.letter_arrived(l) and coalesce(e.saved, true)
        union all
        -- Curious Club discoveries (automatic)
        select d.created_at, jsonb_build_object(
                 'kind', 'discovery', 'ref_id', d.id, 'at', d.created_at, 'caption', coalesce(e.caption, ''),
                 'title', coalesce(t.title, 'A discovery'), 'area', t.area, 'authors', jsonb_build_array(d.user_id),
                 'parts', jsonb_build_array(jsonb_build_object('user_id', d.user_id, 'body', d.body)))
          from public.curious_discoveries d
          left join public.curious_topics t on t.id = d.topic_id
          left join public.scrapbook_entries e on e.relationship_id = rel and e.kind = 'discovery' and e.ref_id = d.id
         where d.relationship_id = rel and coalesce(e.saved, true)
        union all
        -- Our Story milestones (automatic)
        select coalesce(x.happened_on::timestamptz, x.created_at), jsonb_build_object(
                 'kind', 'milestone', 'ref_id', x.id, 'at', coalesce(x.happened_on::timestamptz, x.created_at), 'caption', coalesce(e.caption, ''),
                 'title', x.title, 'milestone_kind', x.kind, 'authors', case when x.created_by is null then '[]'::jsonb else jsonb_build_array(x.created_by) end,
                 'parts', jsonb_build_array(jsonb_build_object('user_id', x.created_by, 'body', x.note)))
          from public.milestones x
          left join public.scrapbook_entries e on e.relationship_id = rel and e.kind = 'milestone' and e.ref_id = x.id
         where x.relationship_id = rel and coalesce(e.saved, true)
        union all
        -- trips & moments
        select x.starts_on::timestamptz, jsonb_build_object(
                 'kind', 'moment', 'ref_id', x.id, 'at', x.starts_on, 'caption', x.caption,
                 'title', x.title, 'place', x.place, 'starts_on', x.starts_on, 'ends_on', x.ends_on,
                 'authors', (select coalesce(jsonb_agg(distinct u), '[]'::jsonb) from (select x.created_by u union select p.added_by from public.moment_photos p where p.moment_id = x.id) q where u is not null),
                 'photos', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'path', p.path, 'taken_at', p.taken_at) order by p.position), '[]'::jsonb)
                              from public.moment_photos p where p.moment_id = x.id))
          from public.moments x
          left join public.scrapbook_entries e on e.relationship_id = rel and e.kind = 'moment' and e.ref_id = x.id
         where x.relationship_id = rel and coalesce(e.saved, true)
        union all
        -- wishes that came true (saved from the Whims list)
        select coalesce(w.revealed_at, w.status_at), jsonb_build_object(
                 'kind', 'whim', 'ref_id', w.id, 'at', coalesce(w.revealed_at, w.status_at), 'caption', e.caption,
                 'title', w.name, 'whim_kind', w.kind, 'authors', jsonb_build_array(w.created_by),
                 'parts', jsonb_build_array(jsonb_build_object('user_id', w.created_by, 'body', w.message, 'image_path', w.photo_path, 'bucket', 'whims')))
          from public.scrapbook_entries e
          join public.whims w on w.id = e.ref_id and w.relationship_id = rel
         where e.relationship_id = rel and e.kind = 'whim' and e.saved and public.whim_came_true(w)
        union all
        -- Quiz Duel results (saved after a match)
        select qm.finished_at, jsonb_build_object(
                 'kind', 'quiz', 'ref_id', qm.id, 'at', qm.finished_at, 'caption', e.caption, 'title', 'Quiz Duel',
                 'authors', (select coalesce(jsonb_agg(distinct a.user_id), '[]'::jsonb) from public.quiz_answers a join public.quiz_rounds r on r.id = a.round_id where r.match_id = qm.id),
                 'scores', (select jsonb_object_agg(z.u, z.s) from (select a.user_id::text u, count(*) filter (where a.correct)::int s
                              from public.quiz_answers a join public.quiz_rounds r on r.id = a.round_id where r.match_id = qm.id group by a.user_id) z),
                 'categories', (select jsonb_agg(c.label order by r.round_no) from public.quiz_rounds r join public.quiz_categories c on c.code = r.category where r.match_id = qm.id))
          from public.scrapbook_entries e
          join public.quiz_matches qm on qm.id = e.ref_id and qm.relationship_id = rel
         where e.relationship_id = rel and e.kind = 'quiz' and e.saved and qm.status = 'finished'
      ) x
  ), '[]'::jsonb);
end;
$$;

-- ------------------------------------------- For you: your move in Quiz Duel
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
    -- Quiz Duel: there's something for you to do in your match (pick or play) after your partner's move
    'quiz_your_move', exists (
       select 1 from public.quiz_matches qm, me where qm.relationship_id = me.rel and qm.status = 'active'
          and exists (select 1 from public.quiz_answers a join public.quiz_rounds r on r.id = a.round_id
                       where r.match_id = qm.id and a.user_id <> me.uid and a.choice is not null)
          and (select (public.quiz_match_state(qm.id))->>'next') in ('pick', 'play')),
    -- when your partner last added a whim (the For you line compares it with what you've seen on this phone)
    'whim_from_partner_at', (
       select max(w.created_at) from public.whims w, me where w.relationship_id = me.rel and w.created_by <> me.uid and not w.archived),
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

-- --------------------------------------------------------------- grants
revoke execute on function
  public.quiz_partner(uuid), public.quiz_playable_categories(uuid), public.quiz_done(uuid, uuid),
  public.quiz_start_match(), public.quiz_pick_category(uuid, text), public.quiz_open_question(uuid, int),
  public.quiz_answer(uuid, int, int), public.quiz_match_state(uuid), public.quiz_matches_list(), public.quiz_end_match(uuid),
  public.quiz_report_question(uuid, text), public.quiz_add_question(text, text, text, text, text, text),
  public.quiz_my_questions(), public.quiz_delete_question(uuid), public.quiz_categories_list()
  from public, anon;
revoke execute on function public.quiz_partner(uuid), public.quiz_playable_categories(uuid), public.quiz_done(uuid, uuid) from authenticated;
grant execute on function
  public.quiz_start_match(), public.quiz_pick_category(uuid, text), public.quiz_open_question(uuid, int),
  public.quiz_answer(uuid, int, int), public.quiz_match_state(uuid), public.quiz_matches_list(), public.quiz_end_match(uuid),
  public.quiz_report_question(uuid, text), public.quiz_add_question(text, text, text, text, text, text),
  public.quiz_my_questions(), public.quiz_delete_question(uuid), public.quiz_categories_list()
  to authenticated;
revoke execute on function public.scrapbook_item_ok(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.for_you(), public.scrapbook_feed(), public.set_scrapbook_entry(text, uuid, boolean, text) from public, anon;
grant execute on function public.for_you(), public.scrapbook_feed(), public.set_scrapbook_entry(text, uuid, boolean, text) to authenticated;
