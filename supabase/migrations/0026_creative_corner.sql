-- =====================================================================
-- Our Little Ritual — Creative Corner (Vee, 15 Nov 2026)
--
-- A little studio for making things together, any time, at your own pace:
--   doodle  — Doodle Relay: one drawing passed back and forth (up to 6 turns each)
--   fold    — Fold & Reveal: one draws the top half, the other the bottom half,
--             neither sees the other's until both are done (sealed here)
--   story   — Story Chain: a story in turns (up to 600 characters a turn, 20 turns)
--   poem    — Poem Duet: one line each, 8–12 lines, optionally an acrostic
--   mixtape — Mixtape Maker: a themed mixtape, up to 12 songs in turns, then a name
--             and a drawn cover
--   board   — Mood Board: up to 12 photos with captions, both add any time
-- No scores, deadlines or reminders. One open relay of each kind at a time;
-- boards are always open. Everything lives in the private `creations` folder.
-- =====================================================================

create table public.creations (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  kind             text not null check (kind in ('doodle', 'fold', 'story', 'poem', 'mixtape', 'board')),
  title            text not null default '' check (char_length(title) <= 160),
  settings         jsonb not null default '{}'::jsonb,
  started_by       uuid not null references auth.users (id) on delete cascade,
  status           text not null default 'active' check (status in ('active', 'finished', 'ended')),
  end_requested_by uuid references auth.users (id) on delete set null,
  cover_path       text check (cover_path is null or char_length(cover_path) <= 300),
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create unique index creations_one_active on public.creations (relationship_id, kind) where status = 'active' and kind <> 'board';
create index creations_rel_idx on public.creations (relationship_id, created_at desc);

create table public.creation_parts (
  id               uuid primary key default gen_random_uuid(),
  creation_id      uuid not null references public.creations (id) on delete cascade,
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  position         int not null,
  body             text check (body is null or char_length(body) <= 600),
  image_path       text check (image_path is null or char_length(image_path) <= 300),
  caption          text check (caption is null or char_length(caption) <= 200),
  song_url         text check (song_url is null or (char_length(song_url) <= 300 and public.is_song_url(song_url))),
  song_title       text check (song_title is null or char_length(song_title) <= 200),
  song_artist      text check (song_artist is null or char_length(song_artist) <= 200),
  song_cover_path  text check (song_cover_path is null or char_length(song_cover_path) <= 300),
  created_at       timestamptz not null default now(),
  unique (creation_id, position)
);

-- How many turns/items each kind allows.
create or replace function public.creation_limit(p_kind text, p_settings jsonb)
returns int language sql immutable set search_path = '' as $$
  select case p_kind when 'doodle' then 12 when 'fold' then 2 when 'story' then 20 when 'mixtape' then 12 when 'board' then 12
                     when 'poem' then greatest(4, least(12, coalesce((p_settings->>'lines')::int, 8))) end;
$$;

-- Whose turn is it? (null for mood boards and anything finished)
create or replace function public.creation_whose_turn(p_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  c public.creations%rowtype;
  last_user uuid;
  partner uuid;
begin
  select * into c from public.creations where id = p_id;
  if not found or c.status <> 'active' or c.kind = 'board' then return null; end if;
  select m.user_id into partner from public.relationship_members m
   where m.relationship_id = c.relationship_id and m.status = 'active' and m.user_id <> c.started_by limit 1;
  if c.kind = 'fold' then
    -- the starter draws the top, the partner the bottom — in any order
    if not exists (select 1 from public.creation_parts p where p.creation_id = c.id and p.user_id = c.started_by) then return c.started_by; end if;
    if not exists (select 1 from public.creation_parts p where p.creation_id = c.id and p.user_id = partner) then return partner; end if;
    return null;
  end if;
  select p.user_id into last_user from public.creation_parts p where p.creation_id = c.id order by p.position desc limit 1;
  if last_user is null then return c.started_by; end if;
  return case when last_user = c.started_by then partner else c.started_by end;
end;
$$;

create or replace function public.start_creation(p_kind text, p_title text default '', p_settings jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
  t text := trim(coalesce(p_title, ''));
  s jsonb := '{}'::jsonb;
  nid uuid;
  word text;
begin
  if rel is null or not exists (select 1 from public.relationships r where r.id = rel and r.status = 'active') then
    raise exception 'Creative Corner opens once your partner has joined.' using errcode = 'P0001';
  end if;
  if p_kind not in ('doodle', 'fold', 'story', 'poem', 'mixtape', 'board') then raise exception 'Unknown kind of creation.' using errcode = '22023'; end if;
  if char_length(t) > 160 then raise exception 'Please keep the title under 160 characters.' using errcode = '22001'; end if;
  if p_kind in ('mixtape', 'board') and t = '' then raise exception 'Give it a theme first.' using errcode = '22023'; end if;
  if p_kind <> 'board' and exists (select 1 from public.creations c where c.relationship_id = rel and c.kind = p_kind and c.status = 'active') then
    raise exception 'You already have one of these going — finish it first.' using errcode = 'P0001';
  end if;
  if p_kind = 'board' and (select count(*) from public.creations c where c.relationship_id = rel and c.kind = 'board' and c.status = 'active') >= 50 then
    raise exception 'That''s a lot of boards! Tidy a few away first.' using errcode = 'P0001';
  end if;
  if p_kind = 'poem' then
    word := upper(regexp_replace(coalesce(p_settings->>'acrostic', ''), '[^A-Za-zÅÄÖåäöÑñ]', '', 'g'));
    if word <> '' then
      if char_length(word) not between 4 and 12 then raise exception 'Acrostic words need 4–12 letters.' using errcode = '22023'; end if;
      s := jsonb_build_object('acrostic', word, 'lines', char_length(word));
    else
      s := jsonb_build_object('lines', case when (p_settings->>'lines') in ('8', '10', '12') then (p_settings->>'lines')::int else 8 end);
    end if;
  end if;
  insert into public.creations (relationship_id, kind, title, settings, started_by) values (rel, p_kind, t, s, auth.uid()) returning id into nid;
  return nid;
end;
$$;

-- Add your turn: a drawing, a few sentences, a line, a song or a photo.
create or replace function public.add_creation_part(p_id uuid, p_body text default null, p_image_path text default null, p_caption text default null,
  p_song_url text default null, p_song_title text default null, p_song_artist text default null, p_song_cover text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.creations%rowtype;
  n int;
  b text := nullif(trim(coalesce(p_body, '')), '');
  img text := nullif(trim(coalesce(p_image_path, '')), '');
  cap text := nullif(trim(coalesce(p_caption, '')), '');
  song text := nullif(trim(coalesce(p_song_url, '')), '');
  scov text := nullif(trim(coalesce(p_song_cover, '')), '');
  pid uuid;
begin
  select * into c from public.creations where id = p_id for update;
  if not found or not public.is_member(c.relationship_id) then raise exception 'We couldn''t find that creation.' using errcode = 'P0001'; end if;
  if c.status <> 'active' then raise exception 'This one is finished.' using errcode = 'P0001'; end if;
  if c.kind = 'fold' then
    -- halves can be drawn in either order, once each
    if exists (select 1 from public.creation_parts p where p.creation_id = c.id and p.user_id = uid) then
      raise exception 'It''s your partner''s turn — your half is in.' using errcode = 'P0001';
    end if;
  elsif c.kind <> 'board' and public.creation_whose_turn(c.id) is distinct from uid then
    raise exception 'It''s your partner''s turn.' using errcode = 'P0001';
  end if;
  select count(*) into n from public.creation_parts where creation_id = c.id;
  if n >= public.creation_limit(c.kind, c.settings) then raise exception 'This one is full.' using errcode = 'P0001'; end if;
  if img is not null and img !~ ('^' || c.relationship_id::text || '/' || c.id::text || '/' || uid::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'That picture can''t be added here.' using errcode = '22023';
  end if;
  if scov is not null and scov !~ ('^' || c.relationship_id::text || '/' || uid::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'That cover can''t be used here.' using errcode = '22023';
  end if;
  case c.kind
    when 'doodle', 'fold' then
      if img is null then raise exception 'Draw something first.' using errcode = '22023'; end if;
    when 'story' then
      if b is null then raise exception 'Write your part first.' using errcode = '22023'; end if;
      if char_length(b) > 600 then raise exception 'Up to 600 characters a turn.' using errcode = '22001'; end if;
    when 'poem' then
      if b is null then raise exception 'Write your line first.' using errcode = '22023'; end if;
      if char_length(b) > 120 then raise exception 'One line — up to 120 characters.' using errcode = '22001'; end if;
      if c.settings ? 'acrostic' and upper(left(b, 1)) <> substr(c.settings->>'acrostic', n + 1, 1) then
        raise exception 'This line should start with "%".', substr(c.settings->>'acrostic', n + 1, 1) using errcode = '22023';
      end if;
    when 'mixtape' then
      if song is null or not public.is_song_url(song) then raise exception 'Add a Spotify song link.' using errcode = '22023'; end if;
      if nullif(trim(coalesce(p_song_title, '')), '') is null then raise exception 'Add the song''s title.' using errcode = '22023'; end if;
    when 'board' then
      if img is null then raise exception 'Add a photo.' using errcode = '22023'; end if;
  end case;
  insert into public.creation_parts (creation_id, relationship_id, user_id, position, body, image_path, caption, song_url, song_title, song_artist, song_cover_path)
  values (c.id, c.relationship_id, uid, n + 1, b, img, left(cap, 200), song, left(trim(p_song_title), 200), left(nullif(trim(coalesce(p_song_artist, '')), ''), 200), scov)
  returning id into pid;
  -- some finish on their own: Fold & Reveal when both halves are in, a poem when its last line is written
  if (c.kind = 'fold' and n + 1 = 2) or (c.kind = 'poem' and n + 1 >= public.creation_limit(c.kind, c.settings)) then
    update public.creations set status = 'finished', finished_at = now() where id = c.id;
  end if;
  return pid;
end;
$$;

-- "It's finished." Story Chain needs you both to agree; the others just need a little in them.
create or replace function public.finish_creation(p_id uuid, p_title text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.creations%rowtype;
  n int;
begin
  select * into c from public.creations where id = p_id for update;
  if not found or not public.is_member(c.relationship_id) then raise exception 'We couldn''t find that creation.' using errcode = 'P0001'; end if;
  if c.status <> 'active' then return c.status; end if;
  if c.kind in ('board', 'fold') then raise exception 'This one doesn''t need finishing.' using errcode = 'P0001'; end if;
  select count(*) into n from public.creation_parts where creation_id = c.id;
  if n < (array[2, 4])[(c.kind in ('story', 'poem'))::int + 1] then
    raise exception 'Add a little more before calling it finished.' using errcode = 'P0001';
  end if;
  if c.kind = 'story' and (c.end_requested_by is null or c.end_requested_by = uid) then
    update public.creations set end_requested_by = uid where id = c.id;
    return 'asked';
  end if;
  if c.kind = 'mixtape' then
    if nullif(trim(coalesce(p_title, '')), '') is null then raise exception 'Give your mixtape a name.' using errcode = '22023'; end if;
    if char_length(trim(p_title)) > 80 then raise exception 'Keep the name under 80 characters.' using errcode = '22001'; end if;
    update public.creations set settings = settings || jsonb_build_object('name', trim(p_title)) where id = c.id;
  end if;
  update public.creations set status = 'finished', finished_at = now() where id = c.id;
  return 'finished';
end;
$$;

-- The story's "The End?" can be taken back by asking to carry on.
create or replace function public.continue_creation(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.creations set end_requested_by = null where id = p_id and status = 'active' and public.is_member(relationship_id);
end;
$$;

create or replace function public.set_creation_cover(p_id uuid, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.creations%rowtype;
begin
  select * into c from public.creations where id = p_id for update;
  if not found or not public.is_member(c.relationship_id) or c.kind <> 'mixtape' then raise exception 'We couldn''t find that mixtape.' using errcode = 'P0001'; end if;
  if p_path is not null and p_path !~ ('^' || c.relationship_id::text || '/' || c.id::text || '/' || auth.uid()::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'That picture can''t be used here.' using errcode = '22023';
  end if;
  update public.creations set cover_path = p_path where id = c.id;
end;
$$;

-- End something early (it's kept out of the list), or delete your own board photo.
create or replace function public.end_creation(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.creations set status = 'ended', finished_at = now() where id = p_id and status = 'active' and public.is_member(relationship_id);
  if not found then raise exception 'There''s nothing going to end.' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.remove_board_photo(p_part uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.creation_parts%rowtype; k text;
begin
  select * into p from public.creation_parts where id = p_part;
  select kind into k from public.creations where id = p.creation_id;
  if not found or p.user_id <> auth.uid() or k <> 'board' then raise exception 'Only the person who added a photo can remove it.' using errcode = 'P0001'; end if;
  delete from public.creation_parts where id = p_part;
  -- close the gap so positions stay tidy
  update public.creation_parts set position = position - 1 where creation_id = p.creation_id and position > p.position;
  return p.image_path;
end;
$$;

-- One creation with its parts. In Fold & Reveal your partner's half stays hidden until both are done.
create or replace function public.creation_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.creations%rowtype;
begin
  select * into c from public.creations where id = p_id;
  if not found or not public.is_member(c.relationship_id) then raise exception 'We couldn''t find that creation.' using errcode = 'P0001'; end if;
  return jsonb_build_object('id', c.id, 'kind', c.kind, 'title', c.title, 'settings', c.settings, 'started_by', c.started_by, 'status', c.status,
    'end_requested_by', c.end_requested_by, 'cover_path', c.cover_path, 'created_at', c.created_at, 'finished_at', c.finished_at,
    'whose_turn', public.creation_whose_turn(c.id), 'limit', public.creation_limit(c.kind, c.settings),
    'parts', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'user_id', p.user_id, 'position', p.position,
                  'hidden', c.kind = 'fold' and c.status = 'active' and p.user_id <> uid,
                  'body', case when c.kind = 'fold' and c.status = 'active' and p.user_id <> uid then null else p.body end,
                  'image_path', case when c.kind = 'fold' and c.status = 'active' and p.user_id <> uid then null else p.image_path end,
                  'caption', p.caption, 'song_url', p.song_url, 'song_title', p.song_title, 'song_artist', p.song_artist,
                  'song_cover_path', p.song_cover_path, 'created_at', p.created_at) order by p.position), '[]'::jsonb)
              from public.creation_parts p where p.creation_id = c.id));
end;
$$;

create or replace function public.creations_list()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'title', c.title, 'settings', c.settings, 'status', c.status,
           'started_by', c.started_by, 'created_at', c.created_at, 'finished_at', c.finished_at, 'cover_path', c.cover_path,
           'whose_turn', public.creation_whose_turn(c.id),
           'parts', (select count(*) from public.creation_parts p where p.creation_id = c.id),
           'preview', (select p.image_path from public.creation_parts p where p.creation_id = c.id and p.image_path is not null
                         and not (c.kind = 'fold' and c.status = 'active') order by p.position desc limit 1))
         order by c.status = 'active' desc, coalesce(c.finished_at, c.created_at) desc), '[]'::jsonb)
    from public.creations c
   where c.relationship_id = public.my_relationship_id() and c.status <> 'ended';
$$;

-- ------------------------------------------------------------------ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creations', 'creations', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- <relationship>/<creation>/<who>/<file>
create or replace function public.can_use_creation_media(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
  rel uuid; cid uuid; usr uuid;
  c public.creations%rowtype;
begin
  if array_length(parts, 1) <> 4 then return false; end if;
  begin rel := parts[1]::uuid; cid := parts[2]::uuid; usr := parts[3]::uuid; exception when others then return false; end;
  if not public.is_member(rel) then return false; end if;
  select * into c from public.creations where id = cid and relationship_id = rel;
  if not found then return false; end if;
  if p_write then return usr = auth.uid() and c.status = 'active' or (usr = auth.uid() and c.kind = 'mixtape'); end if;
  if usr = auth.uid() then return true; end if;
  -- a Fold & Reveal half stays sealed until both are in
  return not (c.kind = 'fold' and c.status = 'active');
end;
$$;
create or replace function public.creation_media_in_use(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.creation_parts p where p.image_path = p_name)
      or exists (select 1 from public.creations c where c.cover_path = p_name);
$$;
create policy "creations bucket: read" on storage.objects
  for select to authenticated using (bucket_id = 'creations' and public.can_use_creation_media(name, false));
create policy "creations bucket: upload own" on storage.objects
  for insert to authenticated with check (bucket_id = 'creations' and public.can_use_creation_media(name, true));
create policy "creations bucket: delete own unattached" on storage.objects
  for delete to authenticated using (bucket_id = 'creations' and public.can_use_creation_media(name, true) and not public.creation_media_in_use(name));

alter table public.creations enable row level security;
alter table public.creation_parts enable row level security;
revoke all on public.creations, public.creation_parts from anon, authenticated;

-- ------------------------------------------------------ scrapbook: kind 'creation'
alter table public.scrapbook_entries drop constraint if exists scrapbook_entries_kind_check;
alter table public.scrapbook_entries add constraint scrapbook_entries_kind_check
  check (kind in ('ritual', 'mission', 'letter', 'discovery', 'milestone', 'moment', 'whim', 'quiz', 'personality', 'knowme', 'creation'));

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
    when 'creation'  then exists (select 1 from public.creations x where x.id = p_ref and x.relationship_id = p_rel
                                    and (x.status = 'finished' or (x.kind = 'board' and exists (select 1 from public.creation_parts p where p.creation_id = x.id))))
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
  if p_kind not in ('ritual', 'mission', 'letter', 'discovery', 'milestone', 'moment', 'whim', 'quiz', 'personality', 'knowme', 'creation') then
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
        union all
        -- Creative Corner creations (saved when finished; mood boards any time)
        select coalesce(c.finished_at, c.created_at), jsonb_build_object('kind', 'creation', 'ref_id', c.id, 'at', coalesce(c.finished_at, c.created_at),
                 'caption', e.caption, 'title', c.title, 'creation_kind', c.kind,
                 'authors', (select coalesce(jsonb_agg(distinct p.user_id), '[]'::jsonb) from public.creation_parts p where p.creation_id = c.id),
                 'parts', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id,
                              'body', case when p.song_url is not null then p.song_title || coalesce(' — ' || nullif(p.song_artist, ''), '') || coalesce(E'\n' || nullif(p.caption, ''), '')
                                           else coalesce(p.body, p.caption) end,
                              'image_path', p.image_path, 'link_url', p.song_url) order by p.position), '[]'::jsonb)
                             from public.creation_parts p where p.creation_id = c.id)
                           || case when c.cover_path is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('user_id', null, 'image_path', c.cover_path, 'body', 'Cover')) end)
          from public.scrapbook_entries e
          join public.creations c on c.id = e.ref_id and c.relationship_id = rel
         where e.relationship_id = rel and e.kind = 'creation' and e.saved
           and (c.status = 'finished' or c.kind = 'board')
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
    -- Creative Corner: your turn in a relay your partner just added to
    'creative_your_turn', (
       select count(*)::int from public.creations c, me
        where c.relationship_id = me.rel and c.status = 'active' and c.kind in ('doodle', 'story', 'poem', 'mixtape', 'fold')
          and public.creation_whose_turn(c.id) = me.uid
          and exists (select 1 from public.creation_parts p where p.creation_id = c.id and p.user_id <> me.uid)),
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

revoke execute on function public.creation_limit(text, jsonb), public.creation_whose_turn(uuid), public.start_creation(text, text, jsonb),
  public.add_creation_part(uuid, text, text, text, text, text, text, text), public.finish_creation(uuid, text), public.continue_creation(uuid),
  public.set_creation_cover(uuid, text), public.end_creation(uuid), public.remove_board_photo(uuid), public.creation_detail(uuid),
  public.creations_list(), public.can_use_creation_media(text, boolean), public.creation_media_in_use(text) from public, anon;
revoke execute on function public.creation_limit(text, jsonb), public.creation_whose_turn(uuid) from authenticated;
grant execute on function public.start_creation(text, text, jsonb), public.add_creation_part(uuid, text, text, text, text, text, text, text),
  public.finish_creation(uuid, text), public.continue_creation(uuid), public.set_creation_cover(uuid, text), public.end_creation(uuid),
  public.remove_board_photo(uuid), public.creation_detail(uuid), public.creations_list(), public.can_use_creation_media(text, boolean),
  public.creation_media_in_use(text) to authenticated;
revoke execute on function public.scrapbook_item_ok(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.for_you(), public.scrapbook_feed(), public.set_scrapbook_entry(text, uuid, boolean, text) from public, anon;
grant execute on function public.for_you(), public.scrapbook_feed(), public.set_scrapbook_entry(text, uuid, boolean, text) to authenticated;
