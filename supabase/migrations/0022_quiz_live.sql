-- =====================================================================
-- Our Little Ritual — Quiz Duel live on a call (approved by Vee, 15 Nov 2026)
--
-- One of you opens a live match; the other joins. Then you both see the same
-- question at the same moment (after a 3-2-1), race the 20-second clock, and
-- see both answers together before the next one. The database keeps the one
-- shared clock; either phone can move things along once time is up, and the
-- phones hear each other through Realtime (with polling as a fallback).
-- Apart matches carry on exactly as before; you can have one of each going.
-- =====================================================================

alter table public.quiz_matches
  add column mode            text not null default 'apart' check (mode in ('apart', 'live')),
  add column live_phase      text check (live_phase in ('lobby', 'pick', 'question', 'reveal')),
  add column live_round      int,
  add column live_q          int,
  add column live_started_at timestamptz,
  add column live_reveal_at  timestamptz,
  add column joined_at       timestamptz,
  add column tick            timestamptz not null default now();

drop index public.quiz_matches_one_active;
create unique index quiz_matches_one_active on public.quiz_matches (relationship_id, mode) where status = 'active';

drop function public.quiz_start_match();
create or replace function public.quiz_start_match(p_mode text default 'apart')
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
  if p_mode not in ('apart', 'live') then raise exception 'Unknown kind of match.' using errcode = '22023'; end if;
  -- a live match nobody touched for 3 hours is tidied away
  update public.quiz_matches set status = 'ended', finished_at = now()
   where relationship_id = rel and status = 'active' and mode = 'live' and tick < now() - interval '3 hours';
  if exists (select 1 from public.quiz_matches m where m.relationship_id = rel and m.status = 'active' and m.mode = p_mode) then
    raise exception 'You already have a match going — finish or end it first.' using errcode = 'P0001';
  end if;
  select array_agg(c order by random()) into cats from public.quiz_playable_categories(rel) c;
  if coalesce(array_length(cats, 1), 0) < 3 then
    raise exception 'There aren''t enough questions yet.' using errcode = 'P0001';
  end if;
  insert into public.quiz_matches (relationship_id, started_by, mode, live_phase)
  values (rel, uid, p_mode, case when p_mode = 'live' then 'lobby' end) returning id into mid;
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


-- The partner joins → round 1's picker chooses a category.
create or replace function public.quiz_live_join(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.quiz_matches%rowtype;
begin
  select * into m from public.quiz_matches where id = p_match for update;
  if not found or not public.is_member(m.relationship_id) or m.mode <> 'live' or m.status <> 'active' then
    raise exception 'We couldn''t find that live match.' using errcode = 'P0001';
  end if;
  if m.started_by = auth.uid() then raise exception 'Waiting for your partner to join.' using errcode = 'P0001'; end if;
  if m.live_phase <> 'lobby' then return; end if;   -- already joined: fine
  update public.quiz_matches set live_phase = 'pick', live_round = 1, joined_at = now(), tick = now() where id = m.id;
end;
$$;

-- Moves a live match along when it's time: both answered (or the clock ran out) → reveal;
-- after 5 seconds of reveal → next question, next round's pick, or the end. Safe to call often.
create or replace function public.quiz_live_step(p_match uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  m public.quiz_matches%rowtype;
  rd public.quiz_rounds%rowtype;
  answered int;
  u uuid;
begin
  select * into m from public.quiz_matches where id = p_match for update;
  if not found or not public.is_member(m.relationship_id) or m.mode <> 'live' then
    raise exception 'We couldn''t find that live match.' using errcode = 'P0001';
  end if;
  if m.status <> 'active' then return m.status; end if;
  select * into rd from public.quiz_rounds where match_id = m.id and round_no = m.live_round;

  if m.live_phase = 'question' then
    select count(*) into answered from public.quiz_answers
     where round_id = rd.id and q_index = m.live_q and choice is not null;
    if answered >= 2 or now() > m.live_started_at + make_interval(secs => public.quiz_seconds() + 1) then
      -- whoever didn't answer in time: counted as "time ran out"
      for u in select x.user_id from public.relationship_members x where x.relationship_id = m.relationship_id and x.status = 'active' loop
        insert into public.quiz_answers (round_id, user_id, q_index, shown_at, answered_at, choice, correct)
        values (rd.id, u, m.live_q, m.live_started_at, now(), -1, false)
        on conflict (round_id, user_id, q_index) do update
          set choice = -1, correct = false, answered_at = now()
          where public.quiz_answers.choice is null;
      end loop;
      update public.quiz_matches set live_phase = 'reveal', live_reveal_at = now(), tick = now() where id = m.id;
      return 'reveal';
    end if;
  elsif m.live_phase = 'reveal' and now() >= m.live_reveal_at + interval '5 seconds' then
    if m.live_q < 2 then
      update public.quiz_matches set live_phase = 'question', live_q = m.live_q + 1,
             live_started_at = now() + interval '3 seconds', tick = now() where id = m.id;
      return 'question';
    elsif m.live_round < 6 then
      update public.quiz_matches set live_phase = 'pick', live_round = m.live_round + 1, live_q = null, tick = now() where id = m.id;
      return 'pick';
    else
      update public.quiz_matches set status = 'finished', finished_at = now(), live_phase = null, tick = now() where id = m.id;
      return 'finished';
    end if;
  end if;
  return coalesce(m.live_phase, 'lobby');
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
  if m.mode = 'live' and (m.live_phase <> 'pick' or m.live_round <> rd.round_no) then
    raise exception 'Not time to pick yet.' using errcode = 'P0001';
  end if;
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
  if m.mode = 'live' then   -- 3, 2, 1… then the first question appears on both phones at once
    update public.quiz_matches set live_phase = 'question', live_q = 0, live_started_at = now() + interval '3 seconds', tick = now()
     where id = m.id;
  end if;
end;
$$;

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
  if m.mode = 'live' then
    -- live: only the question on screen right now, and the shared clock is the one that counts
    if m.live_phase <> 'question' or m.live_round <> rd.round_no or m.live_q <> p_idx then
      raise exception 'That question isn''t on screen right now.' using errcode = 'P0001';
    end if;
    if now() < m.live_started_at then raise exception 'Get ready…' using errcode = 'P0001'; end if;
    insert into public.quiz_answers (round_id, user_id, q_index, shown_at) values (p_round, uid, p_idx, m.live_started_at) on conflict do nothing;
  else
    insert into public.quiz_answers (round_id, user_id, q_index) values (p_round, uid, p_idx) on conflict do nothing;
  end if;
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
  -- live: when you've both answered, show the answers to you both
  if m.mode = 'live' then
    update public.quiz_matches set tick = now() where id = m.id;
    perform public.quiz_live_step(m.id);
  -- finished? (both answered all 18)
  elsif m.status = 'active' and (select count(*) from public.quiz_answers x join public.quiz_rounds r on r.id = x.round_id
                               where r.match_id = m.id and x.choice is not null) = 36 then
    update public.quiz_matches set status = 'finished', finished_at = now() where id = m.id;
  end if;
  partner := public.quiz_partner(m.relationship_id);
  select * into pa from public.quiz_answers where round_id = p_round and user_id = partner and q_index = p_idx and choice is not null;
  return jsonb_build_object('correct', ok, 'timed_out', late, 'right', right_pos, 'choice', case when late then -1 else p_choice end,
    'partner', case when pa.user_id is null then null else jsonb_build_object('choice', pa.choice, 'correct', pa.correct) end);
end;
$$;

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

  if m.status = 'active' and m.mode = 'live' then
    next := coalesce(m.live_phase, 'lobby');
    next_round := m.live_round;
  elsif m.status = 'active' then
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
    'seconds', public.quiz_seconds(),
    'mode', m.mode, 'live_phase', m.live_phase, 'live_round', m.live_round, 'live_q', m.live_q,
    'live_started_at', m.live_started_at, 'live_reveal_at', m.live_reveal_at, 'joined_at', m.joined_at, 'server_now', now(),
    -- live: how quickly each of you answered the question on screen (shown once it's revealed)
    'live_times', case when m.mode = 'live' and m.live_phase = 'reveal' then (
       select jsonb_object_agg(a.user_id::text, round(extract(epoch from a.answered_at - a.shown_at)::numeric, 1))
         from public.quiz_answers a join public.quiz_rounds lr on lr.id = a.round_id
        where lr.match_id = m.id and lr.round_no = m.live_round and a.q_index = m.live_q and a.choice >= 0) end);
end;
$$;

create or replace function public.quiz_matches_list()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'status', m.status, 'mode', m.mode, 'live_phase', m.live_phase, 'started_by', m.started_by, 'created_at', m.created_at, 'finished_at', m.finished_at,
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

-- ------------------------------------------------------------------ realtime
-- The match row holds no answers or questions, only whose turn it is and the clock,
-- so you two may read it — which lets each phone hear the other's moves instantly.
create policy "quiz matches: members read" on public.quiz_matches for select to authenticated using (public.is_member(relationship_id));
grant select on public.quiz_matches to authenticated;
do $rt$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.quiz_matches;
    exception when duplicate_object then null;
    end;
  end if;
end
$rt$;

revoke execute on function public.quiz_start_match(text), public.quiz_live_join(uuid), public.quiz_live_step(uuid) from public, anon;
grant execute on function public.quiz_start_match(text), public.quiz_live_join(uuid), public.quiz_live_step(uuid) to authenticated;
revoke execute on function public.for_you() from public, anon;
grant execute on function public.for_you() to authenticated;
