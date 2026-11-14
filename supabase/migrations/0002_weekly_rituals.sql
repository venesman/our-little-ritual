-- =====================================================================
-- Our Little Ritual — Phase 2: Weekly Ritual
-- activities (42, seeded) · activity_cycles · weekly_activities
--
-- How a week is chosen
--   * The shared boundary is Monday 12:00 UTC (8 pm Malaysia; 8–9 am Chile).
--   * One weekly_activities row per relationship per week — a UNIQUE
--     constraint makes a second row impossible, and the generator locks the
--     relationship row, so whichever partner (or the scheduler) arrives first,
--     both partners always get the same activity.
--   * Within a cycle no activity repeats (UNIQUE (cycle_id, activity_id)).
--     When every active activity has been used, the cycle closes and a new
--     one starts: a fresh shuffle. History is never deleted.
--   * Fair selection: pick from the category used least in this cycle
--     (avoiding last week's category when there is a tie), then a random
--     unused activity in it. Over 42 weeks each category comes up 7 times,
--     and every 6 consecutive weeks visit all 6 categories.
--   * Every week that passes counts as used, done or not — skipping is fine
--     and never blocks the next ritual.
-- =====================================================================

-- ----------------------------------------------------------- activities
create table public.activities (
  id                 uuid primary key default gen_random_uuid(),
  code               smallint not null unique check (code > 0),
  title              text not null check (char_length(title) between 1 and 80),
  category           text not null check (category in (
                       'heart_to_heart', 'creative_corner', 'our_memories',
                       'little_adventures', 'our_future', 'just_for_fun')),
  description        text not null,
  instructions       text not null,
  guiding_questions  text[] not null default '{}',
  duration_label     text not null,
  response_type      text not null check (response_type in (
                       'text', 'photo', 'drawing', 'choices', 'text_photo',
                       'text_drawing', 'text_link', 'drawing_or_text', 'choices_text')),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

-- ------------------------------------------------------- activity_cycles
create table public.activity_cycles (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  cycle_number     int not null check (cycle_number > 0),
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  unique (relationship_id, cycle_number)
);
-- Only one open cycle per relationship.
create unique index activity_cycles_one_open
  on public.activity_cycles (relationship_id) where completed_at is null;

-- ----------------------------------------------------- weekly_activities
create table public.weekly_activities (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  cycle_id         uuid not null references public.activity_cycles (id) on delete cascade,
  activity_id      uuid not null references public.activities (id) on delete restrict,
  week_start       timestamptz not null,       -- the Monday 12:00 UTC release moment
  week_number      int not null check (week_number > 0),
  created_at       timestamptz not null default now(),
  unique (relationship_id, week_start),        -- one shared ritual per week
  unique (relationship_id, week_number),
  unique (cycle_id, activity_id),              -- no repeats within a cycle
  check (extract(isodow from week_start at time zone 'UTC') = 1
         and (week_start at time zone 'UTC')::time = time '12:00')
);
create index weekly_activities_relationship_idx
  on public.weekly_activities (relationship_id, week_start desc);

-- ============================================================= functions

-- The release moment that `ts` falls in: the latest Monday 12:00 UTC <= ts.
create or replace function public.ritual_week_start(ts timestamptz default now())
returns timestamptz language sql immutable set search_path = '' as $$
  select case
    when (date_trunc('week', ts at time zone 'UTC') + interval '12 hours') at time zone 'UTC' <= ts
      then (date_trunc('week', ts at time zone 'UTC') + interval '12 hours') at time zone 'UTC'
    else (date_trunc('week', ts at time zone 'UTC') - interval '7 days' + interval '12 hours') at time zone 'UTC'
  end;
$$;

-- Assign (or fetch) the shared activity for one relationship and week.
-- Internal: not callable by clients.
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

  select count(*) into active_total from public.activities where is_active;
  select count(*) into used_total
    from public.weekly_activities w join public.activities a on a.id = w.activity_id
   where w.cycle_id = cyc.id and a.is_active;

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
     where a.is_active
     group by a.category
  ) s
  where remaining > 0
  order by used asc, (cat = last_cat) asc, random()
  limit 1;

  -- A random unused activity in it (never last week's exact activity).
  select a.id into pick_act
    from public.activities a
   where a.is_active and a.category = pick_cat
     and a.id is distinct from last_act
     and not exists (select 1 from public.weekly_activities w
                      where w.cycle_id = cyc.id and w.activity_id = a.id)
   order by random() limit 1;

  if pick_act is null then   -- only possible if the sole remaining one was last week's
    select a.id into pick_act from public.activities a
     where a.is_active
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

-- Called by the app: make sure this week's shared ritual exists and return it.
-- Safe to call from both phones at once; it always returns the same row.
create or replace function public.ensure_current_ritual()
returns table (
  weekly_id uuid, week_number int, week_start timestamptz, next_release timestamptz,
  cycle_number int, activity_id uuid, code smallint, title text, category text,
  description text, instructions text, guiding_questions text[],
  duration_label text, response_type text
)
language plpgsql security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
  wk  uuid;
  ws  timestamptz := public.ritual_week_start(now());
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  if rel is null then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
  wk := public.assign_weekly_activity(rel, ws);
  return query
    select w.id, w.week_number, w.week_start, w.week_start + interval '7 days',
           c.cycle_number, a.id, a.code, a.title, a.category, a.description,
           a.instructions, a.guiding_questions, a.duration_label, a.response_type
      from public.weekly_activities w
      join public.activity_cycles c on c.id = w.cycle_id
      join public.activities a on a.id = w.activity_id
     where w.id = wk;
end;
$$;

-- Called by the scheduler every Monday 12:00 UTC: prepare every active space.
create or replace function public.generate_weekly_rituals()
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n int := 0;
  ws timestamptz := public.ritual_week_start(now());
begin
  for r in select id from public.relationships where status = 'active' loop
    begin
      perform public.assign_weekly_activity(r.id, ws);
      n := n + 1;
    exception when others then
      raise warning 'weekly ritual for % failed: %', r.id, sqlerrm;
    end;
  end loop;
  return n;
end;
$$;

-- ================================================================== RLS

alter table public.activities        enable row level security;
alter table public.activity_cycles   enable row level security;
alter table public.weekly_activities enable row level security;

create policy "activities: signed-in read" on public.activities
  for select to authenticated using (is_active);
create policy "cycles: members read" on public.activity_cycles
  for select to authenticated using (public.is_member(relationship_id));
create policy "weekly: members read" on public.weekly_activities
  for select to authenticated using (public.is_member(relationship_id));

revoke all on public.activities, public.activity_cycles, public.weekly_activities from anon, authenticated;
grant select on public.activities, public.activity_cycles, public.weekly_activities to authenticated;

revoke execute on function
  public.ritual_week_start(timestamptz), public.assign_weekly_activity(uuid, timestamptz),
  public.ensure_current_ritual(), public.generate_weekly_rituals()
  from public, anon, authenticated;
grant execute on function public.ensure_current_ritual(), public.ritual_week_start(timestamptz) to authenticated;

-- ============================================================ scheduler
-- Pre-creates each week's ritual at release time. The app also creates it on
-- first open (ensure_current_ritual), so the schedule is a convenience, not a
-- dependency. Requires the pg_cron extension (Database → Extensions in Supabase).
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      if exists (select 1 from cron.job where jobname = 'olr-weekly-ritual') then
        perform cron.unschedule('olr-weekly-ritual');
      end if;
      perform cron.schedule('olr-weekly-ritual', '0 12 * * 1', 'select public.generate_weekly_rituals();');
      raise notice 'Scheduled the weekly ritual for Mondays 12:00 UTC.';
    exception when others then
      raise notice 'Could not schedule with pg_cron (%). Rituals will still be created when the app is opened.', sqlerrm;
    end;
  else
    raise notice 'pg_cron not available: weekly rituals will be created when the app is opened.';
  end if;
end
$cron$;

-- ================================================================= seed
-- The 42 activities, as approved by Vee on 15 Nov 2026.
insert into public.activities (code, title, category, description, instructions, guiding_questions, duration_label, response_type) values
(1,  'Three Little Things', 'heart_to_heart', 'Share three small things you appreciate about each other.',
     'Write three small, specific things you appreciated about your partner recently. The smaller and more specific, the better.',
     array['What did they do this week that made life easier?', 'What habit of theirs do you secretly love?', 'What did they say that stayed with you?'], '5–10 min', 'text'),
(2,  'My Safe Place', 'heart_to_heart', 'Describe what makes you feel emotionally safe with your partner.',
     'Describe a moment, word or habit of your partner''s that makes you feel safe, calm or at home — even from far away.',
     array['When do you feel most at ease with them?', 'What do they do when you''re having a hard day?'], '10 min', 'text'),
(3,  'Something I Haven''t Said', 'heart_to_heart', 'Share something positive you''ve been meaning to say.',
     'Write one kind, true thing you''ve thought about your partner but never quite said out loud.',
     array['What do you admire about them that you rarely mention?', 'What are you proud of them for?'], '5–10 min', 'text'),
(4,  'The Little Things', 'heart_to_heart', 'Which small gesture from your partner makes you feel loved?',
     'Name one small gesture your partner does that makes you feel loved, and tell them why it matters.',
     array['Is it a message, a habit, a word, a look?', 'When did you first notice it?'], '5 min', 'text'),
(5,  'How Are We, Really?', 'heart_to_heart', 'An honest check-in in three words.',
     'Choose three words for how you feel about the two of you right now, and add one sentence about each if you like. Honest is better than perfect.',
     array['What''s going well?', 'What feels a bit heavy right now?'], '5 min', 'text'),
(6,  'What I Need', 'heart_to_heart', 'One thing you''d appreciate more of.',
     'Gently share one thing you''d love a little more of in the relationship. Frame it as a wish, not a complaint.',
     array['What would make you feel closer this month?', 'Is there a small thing that would mean a lot?'], '10 min', 'text'),
(7,  'A Letter From My Heart', 'heart_to_heart', 'A short letter about why you''re grateful for each other.',
     'Write a short letter to your partner about why you''re grateful to have them. It can be five lines or a full page.',
     array['Start with: "Lately I''ve been thinking about…"', 'What would you want them to reread on a hard day?'], '15–20 min', 'text'),
(8,  'Draw Us', 'creative_corner', 'Draw the two of you as cartoon characters.',
     'Draw yourselves as cartoon characters — stick figures welcome. Add one detail that''s very "you two".',
     array['What are you each wearing or holding?', 'Where are you standing?'], '10–15 min', 'drawing'),
(9,  'Our Relationship as a Movie', 'creative_corner', 'Invent a movie title and poster idea for your relationship.',
     'Give your relationship a movie title, a genre and a one-line tagline. Sketch or describe the poster.',
     array['Rom-com, adventure, mystery, documentary?', 'Who would play you both?'], '10–15 min', 'text_drawing'),
(10, 'Tiny Comic', 'creative_corner', 'A three-panel comic about a funny moment between you.',
     'Draw a three-panel comic about a funny moment you shared. Beginning, middle, punchline.',
     array['What moment still makes you laugh?', 'What did each of you say?'], '15–20 min', 'drawing'),
(11, 'Colour of Us', 'creative_corner', 'Three colours that represent your relationship.',
     'Pick three colours that feel like your relationship and say why you chose each one.',
     array['What colour is a normal day with them?', 'What colour is missing them?'], '5–10 min', 'text'),
(12, 'Design My Dream Day', 'creative_corner', 'Illustrate your ideal day together.',
     'Draw or describe your perfect day together, from morning to night.',
     array['Where do you wake up?', 'What do you eat?', 'How does the day end?'], '15 min', 'drawing_or_text'),
(13, 'Our Imaginary World', 'creative_corner', 'Invent a fictional world where you both live.',
     'Invent a little world for the two of you: its name, weather, food, rules and one strange tradition.',
     array['What''s the law everyone must follow?', 'What''s your job there?'], '15–20 min', 'text'),
(14, 'Portrait Challenge', 'creative_corner', 'Draw each other from memory.',
     'Draw your partner from memory, without looking at a photo. Imperfect is the point.',
     array['What feature did you draw first?', 'What did you find hardest to remember?'], '10 min', 'drawing'),
(15, 'First Impression', 'our_memories', 'Your first impression of each other.',
     'Describe your very first impression of your partner — honestly and kindly.',
     array['What did you notice first?', 'What did you get completely wrong?'], '10 min', 'text'),
(16, 'Favourite Memory', 'our_memories', 'A favourite memory and why it matters.',
     'Share one favourite memory together and why it matters to you. Add a photo if you have one.',
     array['Where were you?', 'What small detail do you still remember?'], '10–15 min', 'text_photo'),
(17, 'Screenshot of Happiness', 'our_memories', 'An old message that made you smile.',
     'Find an old message between you that made you smile, screenshot it and say why you picked it.',
     array['When was it from?', 'What was happening at the time?'], '5–10 min', 'photo'),
(18, 'Remember When?', 'our_memories', 'A moment your partner may have forgotten.',
     'Describe a small moment you think your partner may have forgotten, but you never did.',
     array['What made it stick in your mind?'], '10 min', 'text'),
(19, 'Our Firsts', 'our_memories', 'One of your favourite relationship firsts.',
     'Choose one "first" — first call, first trip, first fight, first inside joke — and retell it.',
     array['How did you feel just before?', 'What happened right after?'], '10 min', 'text'),
(20, 'Photo Story', 'our_memories', 'One photo and the story behind it.',
     'Choose one photo of the two of you and tell the story behind it.',
     array['What happened just before the photo was taken?', 'What isn''t visible in it?'], '10 min', 'text_photo'),
(21, 'If We Could Relive It', 'our_memories', 'One shared experience you''d love to live again.',
     'Pick one experience you''d love to relive and say what you''d do the same — or differently.',
     array['Which moment would you slow down?'], '10 min', 'text'),
(22, 'One Photo, Two Worlds', 'little_adventures', 'A photo of something beautiful where you are today.',
     'Take a photo of something beautiful where you are today and add one line about it.',
     array['What made you stop and look?'], '5–10 min', 'photo'),
(23, 'Sound of My Day', 'little_adventures', 'A short sound from around you.',
     'Describe a sound from your day — or, once voice notes arrive, record a short clip of it.',
     array['What does your street sound like right now?', 'What sound means "home" to you?'], '5 min', 'text'),
(24, 'Song Exchange', 'little_adventures', 'A song that reminds you of your partner.',
     'Share a song that reminds you of your partner, with a link if you like, and the line or moment that makes you think of them.',
     array['When did you first hear it?', 'Which lyric feels like them?'], '5–10 min', 'text_link'),
(25, 'Five-Minute Exploration', 'little_adventures', 'Explore nearby and share one discovery.',
     'Spend five minutes exploring somewhere nearby and share one interesting thing you found.',
     array['What had you never noticed before?'], '10–15 min', 'text_photo'),
(26, 'Today''s Little Joy', 'little_adventures', 'Something small that made your day better.',
     'Share one small thing that made your day better today.',
     array['A taste, a view, a kind stranger, a good coffee?'], '5 min', 'text_photo'),
(27, 'Opposite Worlds', 'little_adventures', 'Something ordinary where you are that might surprise your partner.',
     'Show something completely ordinary in your country or city that might seem unusual to your partner.',
     array['A snack, a shop sign, a street habit, a household thing?'], '10 min', 'text_photo'),
(28, 'The Same Sky', 'little_adventures', 'Photograph the sky where you are.',
     'Take a photo of the sky from where you are, whenever suits you this week, and note the time.',
     array['What time was it for you, and for them?'], '5 min', 'photo'),
(29, 'Dream Weekend', 'our_future', 'Plan a hypothetical weekend together.',
     'Plan an imaginary weekend together: where, what you''d do, and one silly extra.',
     array['Beach, city, mountains, or staying in?', 'What''s the one must-do?'], '10–15 min', 'text'),
(30, 'Our Bucket List', 'our_future', 'Five things you want to experience together.',
     'Write five things you''d love to experience together — big or small.',
     array['One that''s easy to do soon', 'One that''s wildly ambitious'], '10 min', 'text'),
(31, 'Future Home', 'our_future', 'Describe or sketch your dream home.',
     'Describe or sketch the home you imagine sharing one day.',
     array['Which room matters most to you?', 'What''s outside the window?'], '15 min', 'drawing_or_text'),
(32, 'Our Next Adventure', 'our_future', 'A place you''d love to visit together.',
     'Pick one place you''d love to visit together and say what you''d do first when you arrive.',
     array['Why there?', 'What would you eat?'], '10 min', 'text_photo'),
(33, 'A Day in Our Future', 'our_future', 'An ordinary day in your imagined future.',
     'Describe a completely ordinary day in your future together — the boring, lovely details.',
     array['Who makes breakfast?', 'What does a normal evening look like?'], '15 min', 'text'),
(34, 'Our Little Traditions', 'our_future', 'Invent a new tradition.',
     'Invent one new tradition you''d love the two of you to keep — even while apart.',
     array['Weekly, yearly, or for special days?'], '10 min', 'text'),
(35, 'Ten Years From Now', 'our_future', 'A short message to your future selves.',
     'Write a short message to the two of you ten years from now.',
     array['What do you hope you still do together?', 'What do you hope you''ve stopped worrying about?'], '10–15 min', 'text'),
(36, 'Guess My Answer', 'just_for_fun', 'Answer five playful questions and guess your partner''s answers.',
     'Answer five playful questions about yourself, then guess how your partner answered the same questions. Compare at the reveal.',
     array['Favourite comfort food?', 'Morning person or night owl?', 'Dream superpower?'], '10 min', 'choices_text'),
(37, 'Emoji Story', 'just_for_fun', 'Describe your day in five emojis.',
     'Describe your day using only five emojis. Your partner guesses the story at the reveal.',
     '{}', '5 min', 'text'),
(38, 'This or That', 'just_for_fun', 'Five funny either-or questions.',
     'Answer five quirky either-or questions and see how many you match.',
     array['Pineapple on pizza or never?', 'Beach holiday or snowy cabin?'], '5 min', 'choices'),
(39, 'Who Is More Likely To?', 'just_for_fun', 'Five funny scenarios — who''s more likely?',
     'For five funny scenarios, choose who''s more likely to do it: you or your partner.',
     array['Get lost with GPS on?', 'Cry at an advert?'], '5–10 min', 'choices'),
(40, 'Mystery Challenge', 'just_for_fun', 'Give each other one harmless creative mini-challenge.',
     'Set one small, harmless, creative challenge for your partner to try next week.',
     array['Something that takes under 15 minutes and costs nothing'], '5 min', 'text'),
(41, 'Two Truths and a Lie', 'just_for_fun', 'Two truths and one lie about yourself.',
     'Write two true things and one believable lie about yourself. Guess each other''s lie after the reveal.',
     '{}', '5–10 min', 'text'),
(42, 'Create a Couple''s Award', 'just_for_fun', 'Invent a ridiculous award and nominate each other.',
     'Invent a ridiculous award, nominate your partner and write their acceptance speech for them.',
     array['"Most dramatic sneeze" or "Best at losing socks"?'], '5–10 min', 'text');
