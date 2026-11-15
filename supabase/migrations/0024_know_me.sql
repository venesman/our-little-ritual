-- =====================================================================
-- Our Little Ritual — Quiz Time: How well do you know me? (15 Nov 2026)
--
-- A game has two rounds, one about each of you. In your round you answer five
-- questions about yourself privately; your partner guesses; then your answers
-- are revealed and you mark each guess (spot on · close · not quite). Both
-- rounds run side by side. Your answers stay hidden until your partner has
-- guessed — enforced here. No streaks; the result can go in the scrapbook.
-- =====================================================================

create table public.knowme_questions (
  id      serial primary key,
  text    text not null unique check (char_length(text) between 5 and 200),
  active  boolean not null default true
);
insert into public.knowme_questions (text) values
  ('What''s my favourite comfort food?'),
  ('What''s my go-to karaoke song?'),
  ('What did I want to be when I grew up?'),
  ('What''s my biggest pet peeve?'),
  ('Which smell instantly makes me happy?'),
  ('What''s my perfect rainy-day plan?'),
  ('What''s the one food I''d never eat?'),
  ('What''s my most-used emoji?'),
  ('Which country would I move to tomorrow?'),
  ('What''s my hidden talent?'),
  ('What do I always order at a café?'),
  ('What''s my favourite season?'),
  ('What''s my biggest fear?'),
  ('Which film could I watch again and again?'),
  ('What''s my favourite word in another language?'),
  ('What''s the first thing I do in the morning?'),
  ('What would I buy first if I won the lottery?'),
  ('What was my favourite snack as a kid?'),
  ('Which superpower would I choose?'),
  ('What''s my favourite animal?'),
  ('What''s my guilty-pleasure TV show?'),
  ('What skill do I wish I had?'),
  ('What''s my favourite thing about where I live?'),
  ('What''s my ideal holiday?'),
  ('What''s the best gift I''ve ever received?'),
  ('What am I most proud of?'),
  ('What''s my favourite memory of us?'),
  ('Which song reminds me of you?'),
  ('What''s my favourite colour?'),
  ('What food do I love and hate at the same time?'),
  ('What''s my coffee or tea order?'),
  ('What''s my favourite dessert?'),
  ('Which fictional character am I most like?'),
  ('What''s my favourite thing to do on a call with you?'),
  ('Who was my childhood celebrity crush?'),
  ('What''s my most-played song right now?'),
  ('What habit am I trying to build?'),
  ('Where do I most want us to go together?'),
  ('What makes me laugh the most?'),
  ('What do I miss most when we''re apart?')
on conflict (text) do nothing;

create table public.knowme_games (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  started_by       uuid not null references auth.users (id) on delete cascade,
  status           text not null default 'active' check (status in ('active', 'finished', 'ended')),
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create unique index knowme_one_active on public.knowme_games (relationship_id) where status = 'active';

create table public.knowme_rounds (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.knowme_games (id) on delete cascade,
  subject_id   uuid not null references auth.users (id) on delete cascade,   -- the round is about this person
  questions    text[] not null check (array_length(questions, 1) = 5),
  answers      text[],
  guesses      text[],
  marks        int[],
  answered_at  timestamptz,
  guessed_at   timestamptz,
  marked_at    timestamptz,
  unique (game_id, subject_id)
);

create or replace function public.knowme_start()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rel uuid := public.my_relationship_id();
  gid uuid;
  u uuid;
  used text[] := '{}';
  picked text[];
begin
  if rel is null or not exists (select 1 from public.relationships r where r.id = rel and r.status = 'active') then
    raise exception 'Quiz Time opens once your partner has joined.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.knowme_games g where g.relationship_id = rel and g.status = 'active') then
    raise exception 'You already have a game going — finish or end it first.' using errcode = 'P0001';
  end if;
  insert into public.knowme_games (relationship_id, started_by) values (rel, uid) returning id into gid;
  for u in select m.user_id from public.relationship_members m where m.relationship_id = rel and m.status = 'active' loop
    -- fresh questions first: ones you haven't been asked before
    select array_agg(t) into picked from (
      select q.text t from public.knowme_questions q
       where q.active and not (q.text = any(used))
       order by exists (select 1 from public.knowme_rounds r join public.knowme_games g on g.id = r.game_id
                         where g.relationship_id = rel and r.subject_id = u and q.text = any(r.questions)), random()
       limit 5) s;
    used := used || picked;
    insert into public.knowme_rounds (game_id, subject_id, questions) values (gid, u, picked);
  end loop;
  return gid;
end;
$$;

create or replace function public.knowme_round_for(p_round uuid)
returns public.knowme_rounds language plpgsql stable security definer set search_path = '' as $$
declare r public.knowme_rounds%rowtype; g public.knowme_games%rowtype;
begin
  select * into r from public.knowme_rounds where id = p_round;
  select * into g from public.knowme_games where id = r.game_id;
  if not found or not public.is_member(g.relationship_id) then
    raise exception 'We couldn''t find that round.' using errcode = 'P0001';
  end if;
  if g.status <> 'active' then raise exception 'This game is over.' using errcode = 'P0001'; end if;
  return r;
end;
$$;

-- You answer the five questions about yourself.
create or replace function public.knowme_answer(p_round uuid, p_answers text[])
returns void language plpgsql security definer set search_path = '' as $$
declare r public.knowme_rounds%rowtype;
begin
  r := public.knowme_round_for(p_round);
  if r.subject_id <> auth.uid() then raise exception 'This round is about your partner — you guess instead.' using errcode = 'P0001'; end if;
  if r.answered_at is not null then raise exception 'You''ve already answered.' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_answers, 1), 0) <> 5 or exists (select 1 from unnest(p_answers) a where coalesce(trim(a), '') = '' or char_length(a) > 200) then
    raise exception 'Answer all five (up to 200 characters each).' using errcode = '22023';
  end if;
  update public.knowme_rounds set answers = (select array_agg(trim(a)) from unnest(p_answers) a), answered_at = now() where id = r.id;
end;
$$;

-- Your partner guesses (they can guess before or after you've answered).
create or replace function public.knowme_guess(p_round uuid, p_guesses text[])
returns void language plpgsql security definer set search_path = '' as $$
declare r public.knowme_rounds%rowtype;
begin
  r := public.knowme_round_for(p_round);
  if r.subject_id = auth.uid() then raise exception 'You can''t guess your own answers!' using errcode = 'P0001'; end if;
  if r.guessed_at is not null then raise exception 'You''ve already guessed.' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_guesses, 1), 0) <> 5 or exists (select 1 from unnest(p_guesses) a where coalesce(trim(a), '') = '' or char_length(a) > 200) then
    raise exception 'Make a guess for all five (up to 200 characters each).' using errcode = '22023';
  end if;
  update public.knowme_rounds set guesses = (select array_agg(trim(a)) from unnest(p_guesses) a), guessed_at = now() where id = r.id;
end;
$$;

-- Once both are in, you mark your partner's guesses: 2 spot on · 1 close · 0 not quite.
create or replace function public.knowme_mark(p_round uuid, p_marks int[])
returns void language plpgsql security definer set search_path = '' as $$
declare r public.knowme_rounds%rowtype; gid uuid;
begin
  r := public.knowme_round_for(p_round);
  if r.subject_id <> auth.uid() then raise exception 'The person the round is about does the marking.' using errcode = 'P0001'; end if;
  if r.answered_at is null or r.guessed_at is null then raise exception 'Wait until you''ve both filled in your side.' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_marks, 1), 0) <> 5 or exists (select 1 from unnest(p_marks) m where m is null or m not between 0 and 2) then
    raise exception 'Mark all five guesses.' using errcode = '22023';
  end if;
  update public.knowme_rounds set marks = p_marks, marked_at = now() where id = r.id;
  gid := r.game_id;
  if not exists (select 1 from public.knowme_rounds where game_id = gid and marked_at is null) then
    update public.knowme_games set status = 'finished', finished_at = now() where id = gid;
  end if;
end;
$$;

create or replace function public.knowme_end(p_game uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.knowme_games set status = 'ended', finished_at = now()
   where id = p_game and status = 'active' and public.is_member(relationship_id);
  if not found then raise exception 'There''s no game going to end.' using errcode = 'P0001'; end if;
end;
$$;

-- A game, with each round's answers shown only once the guesser has guessed (or to the subject).
create or replace function public.knowme_state(p_game uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.knowme_games%rowtype;
begin
  if p_game is null then
    select * into g from public.knowme_games where relationship_id = public.my_relationship_id() and status = 'active';
    if not found then return null; end if;
  else
    select * into g from public.knowme_games where id = p_game;
    if not found or not public.is_member(g.relationship_id) then raise exception 'We couldn''t find that game.' using errcode = 'P0001'; end if;
  end if;
  return jsonb_build_object('id', g.id, 'status', g.status, 'created_at', g.created_at, 'finished_at', g.finished_at,
    'rounds', (select jsonb_agg(jsonb_build_object(
        'id', r.id, 'subject_id', r.subject_id, 'questions', r.questions,
        'answered', r.answered_at is not null, 'guessed', r.guessed_at is not null, 'marked', r.marked_at is not null,
        'answers', case when r.subject_id = uid or r.guessed_at is not null then r.answers end,
        'guesses', case when r.subject_id <> uid or r.answered_at is not null then r.guesses end,
        'marks', r.marks,
        'score', (select coalesce(sum(m), 0) from unnest(r.marks) m)) order by (r.subject_id = uid) desc)
      from public.knowme_rounds r where r.game_id = g.id));
end;
$$;

create or replace function public.knowme_history()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'finished_at', g.finished_at,
           'scores', (select jsonb_object_agg(r.subject_id::text, (select coalesce(sum(m), 0) from unnest(r.marks) m)) from public.knowme_rounds r where r.game_id = g.id))
         order by g.finished_at desc), '[]'::jsonb)
    from (select * from public.knowme_games x where x.relationship_id = public.my_relationship_id() and x.status = 'finished'
           order by x.finished_at desc limit 30) g;
$$;

alter table public.knowme_questions enable row level security;
alter table public.knowme_games enable row level security;
alter table public.knowme_rounds enable row level security;
revoke all on public.knowme_questions, public.knowme_games, public.knowme_rounds from anon, authenticated;

revoke execute on function public.knowme_start(), public.knowme_round_for(uuid), public.knowme_answer(uuid, text[]), public.knowme_guess(uuid, text[]),
  public.knowme_mark(uuid, int[]), public.knowme_end(uuid), public.knowme_state(uuid), public.knowme_history() from public, anon;
revoke execute on function public.knowme_round_for(uuid) from authenticated;
grant execute on function public.knowme_start(), public.knowme_answer(uuid, text[]), public.knowme_guess(uuid, text[]),
  public.knowme_mark(uuid, int[]), public.knowme_end(uuid), public.knowme_state(uuid), public.knowme_history() to authenticated;

-- ------------------------------------------------------ scrapbook: kind 'knowme'
alter table public.scrapbook_entries drop constraint if exists scrapbook_entries_kind_check;
alter table public.scrapbook_entries add constraint scrapbook_entries_kind_check
  check (kind in ('ritual', 'mission', 'letter', 'discovery', 'milestone', 'moment', 'whim', 'quiz', 'personality', 'knowme'));

create or replace function public.scrapbook_item_ok(p_rel uuid, p_kind text, p_ref uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'ritual'    then exists (select 1 from public.weekly_activities w where w.id = p_ref and w.relationship_id = p_rel) and public.week_revealed(p_ref)
    when 'mission'   then exists (select 1 from public.apart_missions m where m.id = p_ref and m.relationship_id = p_rel) and public.apart_visible(p_ref)
    when 'letter'    then exists (select 1 from public.letters l where l.id = p_ref and l.relationship_id = p_rel and public.letter_arrived(l))
    when 'discovery' then exists (select 1 from public.curious_discoveries d where d.id = p_ref and d.relationship_id = p_rel)
    when 'milestone' then exists (select 1 from public.milestones x where x.id = p_ref and x.relationship_id = p_rel)
    when 'moment'    then exists (select 1 from public.moments x where x.id = p_ref and x.relationship_id = p_rel)
    when 'personality' then exists (select 1 from public.personality_results x where x.id = p_ref and x.relationship_id = p_rel
                                    and (select count(*) from public.personality_results y where y.relationship_id = p_rel and y.quiz_code = x.quiz_code) = 2)
    when 'knowme'    then exists (select 1 from public.knowme_games x where x.id = p_ref and x.relationship_id = p_rel and x.status = 'finished')
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
  if p_kind not in ('ritual', 'mission', 'letter', 'discovery', 'milestone', 'moment', 'whim', 'quiz', 'personality', 'knowme') then
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
        union all
        -- personality quiz results, both of you side by side (saved after comparing)
        select (select max(y.updated_at) from public.personality_results y where y.relationship_id = rel and y.quiz_code = pr.quiz_code),
               jsonb_build_object('kind', 'personality', 'ref_id', pr.id, 'caption', e.caption, 'title', 'Personality quiz', 'quiz_code', pr.quiz_code,
                 'at', (select max(y.updated_at) from public.personality_results y where y.relationship_id = rel and y.quiz_code = pr.quiz_code),
                 'authors', (select jsonb_agg(y.user_id) from public.personality_results y where y.relationship_id = rel and y.quiz_code = pr.quiz_code),
                 'results', (select jsonb_object_agg(y.user_id::text, y.result) from public.personality_results y where y.relationship_id = rel and y.quiz_code = pr.quiz_code))
          from public.scrapbook_entries e
          join public.personality_results pr on pr.id = e.ref_id and pr.relationship_id = rel
         where e.relationship_id = rel and e.kind = 'personality' and e.saved
           and (select count(*) from public.personality_results y where y.relationship_id = rel and y.quiz_code = pr.quiz_code) = 2
        union all
        -- How well do you know me? (saved after a game)
        select kg.finished_at, jsonb_build_object('kind', 'knowme', 'ref_id', kg.id, 'at', kg.finished_at, 'caption', e.caption,
                 'title', 'How well do you know me?',
                 'authors', (select jsonb_agg(r.subject_id) from public.knowme_rounds r where r.game_id = kg.id),
                 'scores', (select jsonb_object_agg(r.subject_id::text, (select coalesce(sum(m), 0) from unnest(r.marks) m)) from public.knowme_rounds r where r.game_id = kg.id),
                 'parts', (select jsonb_agg(jsonb_build_object('user_id', r.subject_id,
                              'answers', (select jsonb_agg(jsonb_build_object('prompt', r.questions[i], 'answer', r.answers[i] || '  (guess: ' || r.guesses[i] || ')')) from generate_subscripts(r.questions, 1) i)))
                             from public.knowme_rounds r where r.game_id = kg.id))
          from public.scrapbook_entries e
          join public.knowme_games kg on kg.id = e.ref_id and kg.relationship_id = rel
         where e.relationship_id = rel and e.kind = 'knowme' and e.saved and kg.status = 'finished'
      ) x
  ), '[]'::jsonb);
end;
$$;

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
    -- How well do you know me?: something for you to fill in (answer, guess or mark)
    'knowme_your_turn', exists (
       select 1 from public.knowme_rounds r join public.knowme_games g on g.id = r.game_id, me
        where g.relationship_id = me.rel and g.status = 'active'
          and ((r.subject_id = me.uid and (r.answered_at is null or (r.guessed_at is not null and r.marked_at is null)))
            or (r.subject_id <> me.uid and r.guessed_at is null))),
    -- a live Quiz Duel your partner has opened and is waiting for you to join
    'quiz_live_waiting', (
       select qm.id from public.quiz_matches qm, me where qm.relationship_id = me.rel and qm.status = 'active' and qm.mode = 'live'
          and qm.live_phase = 'lobby' and qm.started_by <> me.uid and qm.tick > now() - interval '3 hours' limit 1),
    -- Quiz Duel: there's something for you to do in your match (pick or play) after your partner's move
    'quiz_your_move', exists (
       select 1 from public.quiz_matches qm, me where qm.relationship_id = me.rel and qm.status = 'active' and qm.mode = 'apart'
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

revoke execute on function public.scrapbook_item_ok(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.for_you(), public.scrapbook_feed(), public.set_scrapbook_entry(text, uuid, boolean, text) from public, anon;
grant execute on function public.for_you(), public.scrapbook_feed(), public.set_scrapbook_entry(text, uuid, boolean, text) to authenticated;
