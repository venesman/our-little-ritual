-- =====================================================================
-- Our Little Ritual — Quiz Time: more categories + fewer US-only questions
-- (Vee, 15 Nov 2026)
--
-- New categories: Anime & manga, Video games, Board games, Mythology,
-- Celebrities & musicals. The Open Trivia DB import now keeps those, and skips
-- clearly US-only questions (US sports leagues, US politics, US states…).
-- Questions already imported that look US-only are switched off too.
-- =====================================================================

insert into public.quiz_categories (code, label, sort) values
  ('anime', 'Anime & manga', 16), ('games', 'Video games', 17), ('board_games', 'Board games', 18),
  ('mythology', 'Mythology', 19), ('celebrities', 'Celebrities & musicals', 20)
on conflict (code) do update set label = excluded.label, sort = excluded.sort;
update public.quiz_categories set sort = 30 where code = 'ours';

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
    when 'Entertainment: Japanese Anime & Manga' then 'anime'
    when 'Entertainment: Video Games' then 'games'
    when 'Entertainment: Board Games' then 'board_games'
    when 'Mythology' then 'mythology'
    when 'Celebrities' then 'celebrities'
    when 'Entertainment: Musicals & Theatres' then 'celebrities'
    else null end;     -- still left out: cartoons, comics, politics, vehicles
$$;

-- Is this clearly a US-only question? (US sports leagues, US politics, US states)
create or replace function public.opentdb_us_only(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p ~* '\m(NFL|NBA|MLB|NHL|NCAA|Super Bowl|World Series|USA|United States|Congress|Senate|Supreme Court|Electoral College|Thanksgiving|Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Hawaii|Idaho|Illinois|Iowa|Kansas|Kentucky|Louisiana|Maryland|Massachusetts|Michigan|Minnesota|Missouri|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Wisconsin|Wyoming)\M'
      or p ~* '\mU\.S\.'
      or p ~* '(?<!south |latin |central )\mamericans?\M';
$$;
revoke execute on function public.opentdb_us_only(text), public.opentdb_category(text) from public, anon, authenticated;

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
          if public.opentdb_us_only(public.opentdb_b64(item->>'question') || ' ' || public.opentdb_b64(item->>'correct_answer')) then continue; end if;
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
revoke execute on function public.opentdb_import_step() from public, anon, authenticated;

-- anything already imported that looks US-only is switched off (never deleted, so old matches still make sense)
update public.quiz_questions set active = false
 where source = 'opentdb' and active and public.opentdb_us_only(question || ' ' || correct);
