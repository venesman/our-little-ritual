-- =====================================================================
-- Our Little Ritual — A better relationship record (15 Nov 2026)
--
-- For "Export our story" and the Visits page:
--   * Time together: visits get an occasion, country / city, who travelled,
--     what kind of stay it was (visit · holiday together · living together —
--     only ever chosen by you, never assumed), time with family, and a link
--     to a trip's photos. Past visits can now be added (back to 1990).
--   * Milestone types (first met, relationship began, met family…) and how
--     exact the date is (day · month · year).
--   * Photo dates remember where they came from: the photo's own data, or
--     corrected by hand.
--   * Supporting documents (flight bookings, boarding passes…) attached to a
--     visit or milestone, in a private bucket only the two of you can open.
--   * Each person decides whether their own written words (ritual answers,
--     letters) may appear in the other's export. Off by default.
--   * A fairer monthly summary: no duplicates, completed things only.
-- Everything is additive; the app keeps working until this is run.
-- =====================================================================

-- ------------------------------------------------------- time together
alter table public.visits
  add column if not exists title        text not null default '' check (char_length(title) <= 80),
  add column if not exists country      text not null default '' check (char_length(country) <= 60),
  add column if not exists city         text not null default '' check (char_length(city) <= 60),
  add column if not exists stay_type    text not null default 'visit' check (stay_type in ('visit', 'holiday', 'living_together')),
  add column if not exists travel       text not null default 'unset' check (travel in ('unset', 'one', 'both')),
  add column if not exists travelled_by uuid references auth.users (id) on delete set null,
  add column if not exists with_family  boolean not null default false,
  add column if not exists family_note  text not null default '' check (char_length(family_note) <= 280),
  add column if not exists moment_id    uuid references public.moments (id) on delete set null,
  add column if not exists note_long    text not null default '' check (char_length(note_long) <= 1000);

-- Historical visits are welcome now (the old rule only allowed the last 30 days).
create or replace function public.save_visit(
  p_id uuid, p_place text, p_starts_on date, p_ends_on date default null, p_note text default ''
)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  return public.save_time_together(jsonb_build_object(
    'id', p_id, 'place', p_place, 'starts_on', p_starts_on, 'ends_on', p_ends_on, 'note', p_note, '_keep', true));
end;
$$;

create or replace function public.save_time_together(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_rel    uuid := public.my_relationship_id();
  v_id     uuid := nullif(p ->> 'id', '')::uuid;
  v_keep   boolean := coalesce((p ->> '_keep')::boolean, false);   -- old app: only touch the original fields
  v_place  text := trim(coalesce(p ->> 'place', ''));
  v_start  date := nullif(p ->> 'starts_on', '')::date;
  v_end    date := nullif(p ->> 'ends_on', '')::date;
  v_note   text := trim(coalesce(p ->> 'note', ''));
  v_title  text := trim(coalesce(p ->> 'title', ''));
  v_country text := trim(coalesce(p ->> 'country', ''));
  v_city   text := trim(coalesce(p ->> 'city', ''));
  v_stay   text := coalesce(nullif(p ->> 'stay_type', ''), 'visit');
  v_travel text := coalesce(nullif(p ->> 'travel', ''), 'unset');
  v_by     uuid := nullif(p ->> 'travelled_by', '')::uuid;
  v_family boolean := coalesce((p ->> 'with_family')::boolean, false);
  v_fnote  text := trim(coalesce(p ->> 'family_note', ''));
  v_moment uuid := nullif(p ->> 'moment_id', '')::uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  if v_rel is null then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
  if char_length(v_place) < 1 or char_length(v_place) > 60 then
    raise exception 'Where are you meeting, or where were you? (up to 60 characters)' using errcode = '22023';
  end if;
  if v_start is null then
    raise exception 'Please choose the first day.' using errcode = '22023';
  end if;
  if v_end is not null and v_end < v_start then
    raise exception 'The last day can''t be before the first day.' using errcode = '22023';
  end if;
  if v_start < date '1990-01-01' or v_start > current_date + 3650 then
    raise exception 'Please choose a date between 1990 and ten years from now.' using errcode = '22023';
  end if;
  if v_end is not null and v_end > v_start + 3660 then
    raise exception 'That''s a very long stay — please check the last day.' using errcode = '22023';
  end if;
  if char_length(v_note) > 280 or char_length(v_fnote) > 280 then
    raise exception 'Please keep notes under 280 characters.' using errcode = '22001';
  end if;
  if char_length(v_title) > 80 or char_length(v_country) > 60 or char_length(v_city) > 60 then
    raise exception 'That''s a bit long — please shorten it.' using errcode = '22001';
  end if;
  if v_stay not in ('visit', 'holiday', 'living_together') then
    raise exception 'Unknown kind of stay.' using errcode = '22023';
  end if;
  if v_travel not in ('unset', 'one', 'both') then
    raise exception 'Unknown travel choice.' using errcode = '22023';
  end if;
  if v_travel <> 'one' then v_by := null; end if;
  if v_travel = 'one' and (v_by is null or not exists (
       select 1 from public.relationship_members m where m.relationship_id = v_rel and m.user_id = v_by and m.status = 'active')) then
    raise exception 'Please choose who travelled.' using errcode = '22023';
  end if;
  if v_moment is not null and not exists (select 1 from public.moments x where x.id = v_moment and x.relationship_id = v_rel) then
    raise exception 'We couldn''t find that trip.' using errcode = 'P0001';
  end if;

  if v_id is null then
    if (select count(*) from public.visits v where v.relationship_id = v_rel) >= 300 then
      raise exception 'That''s a lot of visits! Remove some old ones first.' using errcode = 'P0001';
    end if;
    insert into public.visits (relationship_id, created_by, place, starts_on, ends_on, note,
                               title, country, city, stay_type, travel, travelled_by, with_family, family_note, moment_id)
    values (v_rel, auth.uid(), v_place, v_start, v_end, v_note,
            v_title, v_country, v_city, v_stay, v_travel, v_by, v_family, v_fnote, v_moment)
    returning id into v_id;
  elsif v_keep then
    update public.visits v set place = v_place, starts_on = v_start, ends_on = v_end, note = v_note
     where v.id = v_id and v.relationship_id = v_rel returning v.id into v_id;
  else
    update public.visits v
       set place = v_place, starts_on = v_start, ends_on = v_end, note = v_note,
           title = v_title, country = v_country, city = v_city, stay_type = v_stay, travel = v_travel,
           travelled_by = v_by, with_family = v_family, family_note = v_fnote, moment_id = v_moment
     where v.id = v_id and v.relationship_id = v_rel returning v.id into v_id;
  end if;
  if v_id is null then
    raise exception 'We couldn''t find that visit.' using errcode = 'P0001';
  end if;
  return v_id;
end;
$$;

-- ----------------------------------------------------------- milestones
alter table public.milestones
  add column if not exists tag            text check (tag is null or tag in (
    'first_met', 'relationship_start', 'first_visit', 'met_family', 'holiday', 'anniversary',
    'birthday', 'engagement', 'marriage', 'moving', 'other')),
  add column if not exists date_precision text not null default 'day' check (date_precision in ('day', 'month', 'year'));

create or replace function public.save_milestone_v2(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id   uuid;
  v_tag  text := nullif(p ->> 'tag', '');
  v_prec text := coalesce(nullif(p ->> 'date_precision', ''), 'day');
begin
  if v_tag is not null and v_tag not in ('first_met', 'relationship_start', 'first_visit', 'met_family', 'holiday', 'anniversary',
                                         'birthday', 'engagement', 'marriage', 'moving', 'other') then
    raise exception 'Unknown milestone type.' using errcode = '22023';
  end if;
  if v_prec not in ('day', 'month', 'year') then
    raise exception 'Unknown date precision.' using errcode = '22023';
  end if;
  if nullif(p ->> 'happened_on', '') is not null and (p ->> 'happened_on')::date < date '1900-01-01' then
    raise exception 'Please check the date.' using errcode = '22023';
  end if;
  v_id := public.save_milestone(nullif(p ->> 'id', '')::uuid, coalesce(nullif(p ->> 'kind', ''), 'milestone'),
                                p ->> 'title', nullif(p ->> 'happened_on', '')::date, coalesce(p ->> 'note', ''));
  update public.milestones m set tag = v_tag, date_precision = v_prec where m.id = v_id;
  return v_id;
end;
$$;

-- ----------------------------------------------------------- photo dates
alter table public.moment_photos
  add column if not exists taken_at_source text check (taken_at_source is null or taken_at_source in ('photo', 'manual'));
update public.moment_photos set taken_at_source = 'photo' where taken_at is not null and taken_at_source is null;

-- add_moment_photo only ever receives the camera's own date (EXIF), so label it.
create or replace function public.moment_photo_source_default()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.taken_at is not null and new.taken_at_source is null then new.taken_at_source := 'photo'; end if;
  if new.taken_at is null then new.taken_at_source := null; end if;
  return new;
end;
$$;
drop trigger if exists moment_photos_source on public.moment_photos;
create trigger moment_photos_source before insert on public.moment_photos
  for each row execute function public.moment_photo_source_default();

-- Correct (or clear) a photo's date by hand. Stored at midday UTC so the day never shifts.
create or replace function public.set_photo_date(p_id uuid, p_on date)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_on is not null and (p_on < date '1990-01-01' or p_on > current_date + 1) then
    raise exception 'Please choose a date between 1990 and today.' using errcode = '22023';
  end if;
  update public.moment_photos p
     set taken_at = case when p_on is null then null else (p_on::timestamp + interval '12 hours') at time zone 'UTC' end,
         taken_at_source = case when p_on is null then null else 'manual' end
   where p.id = p_id and p.relationship_id = public.my_relationship_id();
  if not found then
    raise exception 'We couldn''t find that photo.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.moment_photo_sources()
returns table (id uuid, taken_at_source text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.taken_at_source from public.moment_photos p where p.relationship_id = public.my_relationship_id();
$$;

-- ---------------------------------------------------- supporting documents
create table if not exists public.supporting_documents (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  attached_kind    text not null check (attached_kind in ('visit', 'milestone')),
  ref_id           uuid not null,
  path             text not null unique check (char_length(path) <= 300),
  file_name        text not null check (char_length(file_name) between 1 and 120),
  doc_type         text not null default 'other' check (doc_type in ('travel_booking', 'boarding_pass', 'accommodation', 'entry_stamp', 'other')),
  note             text not null default '' check (char_length(note) <= 200),
  added_by         uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists supporting_documents_ref_idx on public.supporting_documents (relationship_id, attached_kind, ref_id);
alter table public.supporting_documents enable row level security;
revoke all on public.supporting_documents from anon, authenticated;

create or replace function public.add_document(p_kind text, p_ref uuid, p_path text, p_file_name text, p_doc_type text default 'other', p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
  parts text[] := string_to_array(coalesce(p_path, ''), '/');
  v_name text := trim(coalesce(p_file_name, ''));
  v_note text := trim(coalesce(p_note, ''));
  v_id uuid;
begin
  if auth.uid() is null or rel is null then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
  if p_kind not in ('visit', 'milestone') then
    raise exception 'Unknown place to attach this.' using errcode = '22023';
  end if;
  if (p_kind = 'visit' and not exists (select 1 from public.visits v where v.id = p_ref and v.relationship_id = rel))
     or (p_kind = 'milestone' and not exists (select 1 from public.milestones m where m.id = p_ref and m.relationship_id = rel)) then
    raise exception 'We couldn''t find that.' using errcode = 'P0001';
  end if;
  if array_length(parts, 1) <> 3 or parts[1] <> rel::text or parts[2] <> auth.uid()::text then
    raise exception 'That file isn''t in the right place.' using errcode = '22023';
  end if;
  if char_length(v_name) < 1 then v_name := 'Document'; end if;
  v_name := left(v_name, 120);
  if coalesce(p_doc_type, 'other') not in ('travel_booking', 'boarding_pass', 'accommodation', 'entry_stamp', 'other') then
    raise exception 'Unknown kind of document.' using errcode = '22023';
  end if;
  if char_length(v_note) > 200 then
    raise exception 'Please keep the note under 200 characters.' using errcode = '22001';
  end if;
  if (select count(*) from public.supporting_documents d where d.relationship_id = rel) >= 300 then
    raise exception 'That''s a lot of documents! Remove a few first.' using errcode = 'P0001';
  end if;
  insert into public.supporting_documents (relationship_id, attached_kind, ref_id, path, file_name, doc_type, note, added_by)
  values (rel, p_kind, p_ref, p_path, v_name, coalesce(p_doc_type, 'other'), v_note, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Either of you can remove one (like visits). Returns the file path so the app can delete the file.
create or replace function public.remove_document(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  delete from public.supporting_documents d where d.id = p_id and d.relationship_id = public.my_relationship_id()
  returning d.path into v_path;
  if v_path is null then
    raise exception 'We couldn''t find that document.' using errcode = 'P0001';
  end if;
  return v_path;
end;
$$;

create or replace function public.documents_list()
returns table (id uuid, attached_kind text, ref_id uuid, path text, file_name text, doc_type text, note text, added_by uuid, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.attached_kind, d.ref_id, d.path, d.file_name, d.doc_type, d.note, d.added_by, d.created_at
    from public.supporting_documents d where d.relationship_id = public.my_relationship_id()
   order by d.created_at;
$$;

-- When a visit or milestone goes, its document rows go too (the file can no longer be opened by anyone).
create or replace function public.forget_documents_of()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.supporting_documents d
   where d.attached_kind = tg_argv[0] and d.ref_id = old.id and d.relationship_id = old.relationship_id;
  return old;
end;
$$;
drop trigger if exists visits_forget_documents on public.visits;
create trigger visits_forget_documents after delete on public.visits
  for each row execute function public.forget_documents_of('visit');
drop trigger if exists milestones_forget_documents on public.milestones;
create trigger milestones_forget_documents after delete on public.milestones
  for each row execute function public.forget_documents_of('milestone');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- <relationship>/<who uploaded>/<file>
create or replace function public.can_upload_document(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_name, '/');
begin
  if array_length(parts, 1) <> 3 then return false; end if;
  return parts[1] = public.my_relationship_id()::text and parts[2] = auth.uid()::text;
end;
$$;
create or replace function public.can_read_document(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.supporting_documents d where d.path = p_name and public.is_member(d.relationship_id));
$$;
-- A file can be deleted once its row is gone (or it never got one), by either of you.
create or replace function public.can_delete_document(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(p_name, '/');
begin
  if array_length(parts, 1) <> 3 then return false; end if;
  return parts[1] = public.my_relationship_id()::text
     and not exists (select 1 from public.supporting_documents d where d.path = p_name);
end;
$$;

drop policy if exists "documents bucket: members read" on storage.objects;
drop policy if exists "documents bucket: upload own" on storage.objects;
drop policy if exists "documents bucket: delete detached" on storage.objects;
create policy "documents bucket: members read" on storage.objects
  for select to authenticated using (bucket_id = 'documents' and public.can_read_document(name));
create policy "documents bucket: upload own" on storage.objects
  for insert to authenticated with check (bucket_id = 'documents' and public.can_upload_document(name));
create policy "documents bucket: delete detached" on storage.objects
  for delete to authenticated using (bucket_id = 'documents' and public.can_delete_document(name));

-- --------------------------------------------- your words in exports
alter table public.profiles add column if not exists export_my_words boolean not null default false;

create or replace function public.set_export_my_words(p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set export_my_words = coalesce(p_on, false) where id = auth.uid();
end;
$$;

-- { "<user id>": true/false } for the two of you.
create or replace function public.export_consent()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(p.id::text, p.export_my_words), '{}'::jsonb)
    from public.relationship_members m join public.profiles p on p.id = m.user_id
   where m.relationship_id = public.my_relationship_id() and m.status = 'active';
$$;

-- ---------------------------------------------- fairer monthly summary
-- Communication: weekly rituals you both answered, check-ins you both did.
-- Letters: delivered letters, per writer.
-- Activities: days with a call activity (several on one day count once),
--             finished quizzes / games, things finished in Creative Corner.
-- Experiences: research dates finished, apart missions you BOTH posted to,
--             different songs shared (the same song twice counts once).
create or replace function public.export_activity_summary_v3(p_from date, p_to date)
returns table (month date, rituals_both int, checkins_both int, letters_by jsonb, call_days int, games int, creations int,
               research int, missions_both int, songs int)
language sql stable security definer set search_path = '' as $$
  with rel as (select public.my_relationship_id() id)
  select s.month, s.rituals_both, s.checkins_both,
    (select coalesce(jsonb_object_agg(x.sender_id::text, x.n), '{}'::jsonb) from (
       select l.sender_id, count(*)::int n from public.letters l
        where l.relationship_id = (select id from rel) and l.status = 'sent' and (l.reveal_at is null or l.reveal_at <= now())
          and date_trunc('month', coalesce(l.reveal_at, l.sent_at))::date = s.month
        group by l.sender_id) x),
    (select count(distinct (p.started_at at time zone 'UTC')::date)::int from public.play_sessions p
      where p.relationship_id = (select id from rel) and date_trunc('month', p.started_at)::date = s.month),
    (select count(*)::int from public.quiz_matches q where q.relationship_id = (select id from rel) and q.status = 'finished'
       and date_trunc('month', q.finished_at)::date = s.month)
    + (select count(*)::int from public.knowme_games k where k.relationship_id = (select id from rel) and k.status = 'finished'
       and date_trunc('month', k.finished_at)::date = s.month),
    (select count(*)::int from public.creations c where c.relationship_id = (select id from rel) and c.status = 'finished'
       and date_trunc('month', c.finished_at)::date = s.month),
    s.curious_sessions,
    (select count(*)::int from public.apart_missions a where a.relationship_id = (select id from rel)
       and date_trunc('month', a.created_at)::date = s.month
       and (select count(distinct e.user_id) from public.apart_entries e where e.mission_id = a.id) >= 2),
    (select count(distinct u.url)::int from (
       select t.song_url url from public.soundtrack_entries t where t.relationship_id = (select id from rel)
          and date_trunc('month', t.shared_on)::date = s.month
       union
       select l.song_url from public.letters l where l.relationship_id = (select id from rel) and l.song_url is not null and l.opened_at is not null
          and date_trunc('month', coalesce(l.reveal_at, l.sent_at))::date = s.month) u)
  from public.export_activity_summary(p_from, p_to) s;
$$;

-- ------------------------------------------------- timeline: types too
create or replace function public.timeline_feed()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select public.my_relationship_id() rel)
  select coalesce(jsonb_agg(e order by (e->>'on') desc, e->>'kind'), '[]'::jsonb) from (
    select jsonb_build_object('kind', 'began', 'on', (coalesce(r.activated_at, r.created_at))::date, 'title', 'Our Little Ritual began',
             'subtitle', 'You both joined your space') e
      from public.relationships r, me where r.id = me.rel
    union all
    select jsonb_build_object('kind', m.kind, 'on', m.happened_on, 'title', m.title, 'subtitle', nullif(m.note, ''), 'ref_id', m.id, 'by', m.created_by,
             'tag', m.tag, 'precision', m.date_precision, 'upcoming', m.happened_on > current_date)
      from public.milestones m, me where m.relationship_id = me.rel and m.happened_on is not null
    union all
    select jsonb_build_object('kind', 'moment', 'on', x.starts_on, 'until', x.ends_on, 'title', x.title, 'subtitle', nullif(x.place, ''), 'ref_id', x.id,
             'photo', (select p.path from public.moment_photos p where p.moment_id = x.id order by p.position limit 1))
      from public.moments x, me where x.relationship_id = me.rel
    union all
    select jsonb_build_object('kind', 'visit', 'on', v.starts_on, 'until', v.ends_on,
             'title', coalesce(nullif(v.title, ''), 'Together in ' || v.place),
             'subtitle', nullif(concat_ws(' · ', nullif(concat_ws(', ', nullif(v.city, ''), nullif(v.country, '')), ''), nullif(v.note, '')), ''),
             'ref_id', v.id, 'upcoming', v.starts_on > current_date, 'stay_type', v.stay_type, 'with_family', v.with_family)
      from public.visits v, me where v.relationship_id = me.rel
    union all
    select jsonb_build_object('kind', 'first', 'on', f.on_day, 'title', f.title) from (
      select (select min(w.week_start)::date from public.weekly_activities w where w.relationship_id = me.rel and public.week_revealed(w.id)) on_day,
             'Your first weekly ritual, opened together' title from me
      union all
      select (select min(coalesce(l.reveal_at, l.sent_at))::date from public.letters l where l.relationship_id = me.rel and l.opened_at is not null), 'The first letter in your Mailbox' from me
      union all
      select (select min(s.shared_on) from public.soundtrack_entries s where s.relationship_id = me.rel), 'The first song on Our Soundtrack' from me
      union all
      select (select min(q.finished_at)::date from public.quiz_matches q where q.relationship_id = me.rel and q.status = 'finished'), 'Your first Quiz Duel' from me
      union all
      select (select min(c.finished_at)::date from public.creations c where c.relationship_id = me.rel and c.status = 'finished'), 'The first thing you made in Creative Corner' from me
      union all
      select (select min(k.finished_at)::date from public.knowme_games k where k.relationship_id = me.rel and k.status = 'finished'), 'Your first "How well do you know me?"' from me
    ) f where f.on_day is not null
  ) q;
$$;

-- ---------------------------------------------------------------- grants
revoke execute on function
  public.save_time_together(jsonb), public.save_milestone_v2(jsonb), public.set_photo_date(uuid, date), public.moment_photo_sources(),
  public.add_document(text, uuid, text, text, text, text), public.remove_document(uuid), public.documents_list(),
  public.can_upload_document(text), public.can_read_document(text), public.can_delete_document(text),
  public.set_export_my_words(boolean), public.export_consent(), public.export_activity_summary_v3(date, date),
  public.forget_documents_of(), public.moment_photo_source_default()
  from public, anon;
grant execute on function
  public.save_time_together(jsonb), public.save_milestone_v2(jsonb), public.set_photo_date(uuid, date), public.moment_photo_sources(),
  public.add_document(text, uuid, text, text, text, text), public.remove_document(uuid), public.documents_list(),
  public.can_upload_document(text), public.can_read_document(text), public.can_delete_document(text),
  public.set_export_my_words(boolean), public.export_consent(), public.export_activity_summary_v3(date, date)
  to authenticated;
