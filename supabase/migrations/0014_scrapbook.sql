-- =====================================================================
-- Our Little Ritual — Our Scrapbook + trips & moments (approved by Vee, 15 Nov 2026)
--
-- A shared, polaroid-style memory gallery. What goes in:
--   * weekly rituals and Apart missions — saved with "Save to scrapbook", only
--     once they're open to both of you
--   * loved letters, Curious Club discoveries and Our Story milestones — appear
--     automatically (either of you can remove one from the scrapbook)
--   * trips & moments you add yourselves, with up to 12 photos each, dated any
--     time (including before you started using the app)
-- Removing from the scrapbook never deletes the original. Check-ins stay out.
-- The feed is assembled here, so nothing sealed can ever leak into it.
-- =====================================================================

create table public.scrapbook_entries (
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  kind             text not null check (kind in ('ritual', 'mission', 'letter', 'discovery', 'milestone', 'moment')),
  ref_id           uuid not null,
  saved            boolean not null default true,   -- false = removed from the scrapbook
  caption          text not null default '' check (char_length(caption) <= 300),
  saved_by         uuid references auth.users (id) on delete set null,
  updated_at       timestamptz not null default now(),
  primary key (relationship_id, kind, ref_id)
);

create table public.moments (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 80),
  place            text not null default '' check (char_length(place) <= 120),
  starts_on        date not null,
  ends_on          date,
  caption          text not null default '' check (char_length(caption) <= 1000),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_on is null or (ends_on >= starts_on and ends_on <= starts_on + 366)),
  check (starts_on >= date '1990-01-01')
);
create index moments_rel_idx on public.moments (relationship_id, starts_on desc);

create table public.moment_photos (
  id               uuid primary key default gen_random_uuid(),
  moment_id        uuid not null references public.moments (id) on delete cascade,
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  path             text not null unique check (char_length(path) <= 300),
  taken_at         timestamptz,
  position         int not null default 0,
  added_by         uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index moment_photos_moment_idx on public.moment_photos (moment_id, position);

-- ----------------------------------------------------------- moments
create or replace function public.save_moment(p_id uuid, p_title text, p_place text, p_starts_on date, p_ends_on date default null, p_caption text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
  t   text := trim(coalesce(p_title, ''));
  pl  text := trim(coalesce(p_place, ''));
  c   text := trim(coalesce(p_caption, ''));
  mid uuid;
begin
  if rel is null or not exists (select 1 from public.relationships where id = rel and status = 'active') then
    raise exception 'The scrapbook opens once your partner has joined.' using errcode = 'P0001';
  end if;
  if char_length(t) < 1 or char_length(t) > 80 then
    raise exception 'Please give it a title (up to 80 characters).' using errcode = '22023';
  end if;
  if char_length(pl) > 120 or char_length(c) > 1000 then
    raise exception 'That''s a little long — please shorten the place or caption.' using errcode = '22001';
  end if;
  if p_starts_on is null or p_starts_on < date '1990-01-01' or p_starts_on > current_date + 1 then
    raise exception 'Please choose a start date that isn''t in the future.' using errcode = '22023';
  end if;
  if p_ends_on is not null and (p_ends_on < p_starts_on or p_ends_on > p_starts_on + 366 or p_ends_on > current_date + 1) then
    raise exception 'The end date should be after the start (within a year) and not in the future.' using errcode = '22023';
  end if;
  if p_id is null then
    if (select count(*) from public.moments where relationship_id = rel) >= 500 then
      raise exception 'That''s a lot of moments! Remove a few first.' using errcode = 'P0001';
    end if;
    insert into public.moments (relationship_id, title, place, starts_on, ends_on, caption, created_by)
    values (rel, t, pl, p_starts_on, p_ends_on, c, auth.uid()) returning id into mid;
  else
    update public.moments set title = t, place = pl, starts_on = p_starts_on, ends_on = p_ends_on, caption = c, updated_at = now()
     where id = p_id and relationship_id = rel returning id into mid;
    if mid is null then
      raise exception 'We couldn''t find that moment.' using errcode = 'P0001';
    end if;
  end if;
  return mid;
end;
$$;

-- Deletes a moment (both of you can edit everything). The app removes its photo files first.
create or replace function public.delete_moment(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.moments where id = p_id and relationship_id = public.my_relationship_id();
  if not found then
    raise exception 'We couldn''t find that moment.' using errcode = 'P0001';
  end if;
  delete from public.scrapbook_entries where kind = 'moment' and ref_id = p_id;
end;
$$;

create or replace function public.add_moment_photo(p_moment uuid, p_path text, p_taken_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  m   public.moments%rowtype;
  pid uuid;
begin
  select * into m from public.moments where id = p_moment for update;
  if not found or not public.is_member(m.relationship_id) then
    raise exception 'We couldn''t find that moment.' using errcode = 'P0001';
  end if;
  if p_path is null or p_path !~ ('^' || m.relationship_id::text || '/' || m.id::text || '/' || auth.uid()::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'That photo can''t be attached here.' using errcode = '22023';
  end if;
  if (select count(*) from public.moment_photos where moment_id = m.id) >= 12 then
    raise exception 'Up to 12 photos per moment — start another one for more.' using errcode = 'P0001';
  end if;
  if p_taken_at is not null and (p_taken_at > now() + interval '1 day' or p_taken_at < timestamptz '1990-01-01') then
    p_taken_at := null;   -- an implausible camera date is dropped, not trusted
  end if;
  insert into public.moment_photos (moment_id, relationship_id, path, taken_at, position, added_by)
  values (m.id, m.relationship_id, p_path, p_taken_at,
          coalesce((select max(position) + 1 from public.moment_photos where moment_id = m.id), 0), auth.uid())
  returning id into pid;
  return pid;
end;
$$;

create or replace function public.remove_moment_photo(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare p text;
begin
  delete from public.moment_photos where id = p_id and public.is_member(relationship_id) returning path into p;
  if p is null then
    raise exception 'We couldn''t find that photo.' using errcode = 'P0001';
  end if;
  return p;   -- the app then deletes the file
end;
$$;

-- ------------------------------------------------- save / caption / remove
-- Is this item open to both of you (so it may enter the scrapbook)?
create or replace function public.scrapbook_item_ok(p_rel uuid, p_kind text, p_ref uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'ritual'    then exists (select 1 from public.weekly_activities w where w.id = p_ref and w.relationship_id = p_rel) and public.week_revealed(p_ref)
    when 'mission'   then exists (select 1 from public.apart_missions m where m.id = p_ref and m.relationship_id = p_rel) and public.apart_visible(p_ref)
    when 'letter'    then exists (select 1 from public.letters l where l.id = p_ref and l.relationship_id = p_rel and public.letter_arrived(l))
    when 'discovery' then exists (select 1 from public.curious_discoveries d where d.id = p_ref and d.relationship_id = p_rel)
    when 'milestone' then exists (select 1 from public.milestones x where x.id = p_ref and x.relationship_id = p_rel)
    when 'moment'    then exists (select 1 from public.moments x where x.id = p_ref and x.relationship_id = p_rel)
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
  if p_kind not in ('ritual', 'mission', 'letter', 'discovery', 'milestone', 'moment') then
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

-- -------------------------------------------------------------- the feed
-- One list of memories, newest first. Everything in it is already open to both.
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
      ) x
  ), '[]'::jsonb);
end;
$$;

-- What's saved (for showing "Saved ✓" on ritual and mission screens).
create or replace function public.scrapbook_saved(p_kind text, p_ref uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select saved from public.scrapbook_entries
                    where relationship_id = public.my_relationship_id() and kind = p_kind and ref_id = p_ref), false);
$$;

-- Removed items, so they can be put back.
create or replace function public.scrapbook_removed()
returns table (kind text, ref_id uuid, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.kind, e.ref_id, e.updated_at from public.scrapbook_entries e
   where e.relationship_id = public.my_relationship_id() and not e.saved
   order by e.updated_at desc limit 100;
$$;

-- ------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moments', 'moments', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- <relationship>/<moment>/<uploader>/<file>. Both of you can see and remove every photo.
create or replace function public.can_use_moment_media(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
  rel uuid; mid uuid; usr uuid;
begin
  if array_length(parts, 1) <> 4 then return false; end if;
  begin rel := parts[1]::uuid; mid := parts[2]::uuid; usr := parts[3]::uuid; exception when others then return false; end;
  return public.is_member(rel)
     and exists (select 1 from public.moments m where m.id = mid and m.relationship_id = rel)
     and (not p_write or usr = auth.uid());
end;
$$;

create policy "moments bucket: members read" on storage.objects
  for select to authenticated using (bucket_id = 'moments' and public.can_use_moment_media(name, false));
create policy "moments bucket: upload to own folder" on storage.objects
  for insert to authenticated with check (bucket_id = 'moments' and public.can_use_moment_media(name, true));
create policy "moments bucket: members delete unattached" on storage.objects
  for delete to authenticated using (bucket_id = 'moments' and public.can_use_moment_media(name, false)
                                     and not exists (select 1 from public.moment_photos p where p.path = name));

-- ------------------------------------------------------------------ RLS
alter table public.scrapbook_entries enable row level security;
alter table public.moments           enable row level security;
alter table public.moment_photos     enable row level security;
create policy "scrapbook entries: members read" on public.scrapbook_entries for select to authenticated using (public.is_member(relationship_id));
create policy "moments: members read" on public.moments for select to authenticated using (public.is_member(relationship_id));
create policy "moment photos: members read" on public.moment_photos for select to authenticated using (public.is_member(relationship_id));
revoke all on public.scrapbook_entries, public.moments, public.moment_photos from anon, authenticated;
grant select on public.scrapbook_entries, public.moments, public.moment_photos to authenticated;

revoke execute on function
  public.save_moment(uuid, text, text, date, date, text), public.delete_moment(uuid), public.add_moment_photo(uuid, text, timestamptz),
  public.remove_moment_photo(uuid), public.scrapbook_item_ok(uuid, text, uuid), public.set_scrapbook_entry(text, uuid, boolean, text),
  public.scrapbook_feed(), public.scrapbook_saved(text, uuid), public.scrapbook_removed(), public.can_use_moment_media(text, boolean)
  from public, anon;
revoke execute on function public.scrapbook_item_ok(uuid, text, uuid) from authenticated;
grant execute on function
  public.save_moment(uuid, text, text, date, date, text), public.delete_moment(uuid), public.add_moment_photo(uuid, text, timestamptz),
  public.remove_moment_photo(uuid), public.set_scrapbook_entry(text, uuid, boolean, text),
  public.scrapbook_feed(), public.scrapbook_saved(text, uuid), public.scrapbook_removed(), public.can_use_moment_media(text, boolean)
  to authenticated;

-- ---------------------------------------------------------- export summary
-- Month-by-month counts of things you did together (for the exported record).
-- Counts only — no content.
create or replace function public.export_activity_summary(p_from date, p_to date)
returns table (month date, rituals_both int, checkins_both int, letters int, play_sessions int, curious_sessions int, apart_missions int)
language sql stable security definer set search_path = '' as $$
  with rel as (select public.my_relationship_id() id),
  months as (
    select generate_series(date_trunc('month', greatest(p_from, date '2000-01-01')), date_trunc('month', least(p_to, current_date)), interval '1 month')::date m
    where p_to >= p_from and p_to - p_from <= 3700
  )
  select mo.m,
    (select count(*)::int from public.weekly_activities w where w.relationship_id = (select id from rel)
       and date_trunc('month', w.week_start)::date = mo.m and public.week_revealed(w.id)),
    (select count(*)::int from (select c.week_start from public.checkins c where c.relationship_id = (select id from rel) and c.status = 'submitted'
       and date_trunc('month', c.week_start)::date = mo.m group by c.week_start having count(*) >= 2) q),
    (select count(*)::int from public.letters l where l.relationship_id = (select id from rel) and l.status = 'sent'
       and (l.reveal_at is null or l.reveal_at <= now()) and date_trunc('month', coalesce(l.reveal_at, l.sent_at))::date = mo.m),
    (select count(*)::int from public.play_sessions s where s.relationship_id = (select id from rel) and date_trunc('month', s.started_at)::date = mo.m),
    (select count(*)::int from public.curious_sessions s where s.relationship_id = (select id from rel) and s.ended_at is not null and date_trunc('month', s.started_at)::date = mo.m),
    (select count(*)::int from public.apart_missions a where a.relationship_id = (select id from rel) and date_trunc('month', a.created_at)::date = mo.m)
  from months mo
  where (select id from rel) is not null
  order by mo.m;
$$;
revoke execute on function public.export_activity_summary(date, date) from public, anon;
grant execute on function public.export_activity_summary(date, date) to authenticated;
