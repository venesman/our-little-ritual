-- =====================================================================
-- Our Little Ritual — Our Mailbox + voice notes (approved by Vee, 15 Nov 2026)
--
-- Letters: love letter, short note, compliment, appreciation, future letter,
-- surprise. Drafts are private; a sent letter can't be edited; it can open now
-- or on a chosen date (until then the recipient sees only a sealed envelope and
-- its date); the sender can take it back until it's opened; one photo and one
-- voice note (≤ 2 min) per letter; shared "Letters we love".
--
-- Voice notes are also added to Weekly Ritual #23 "Sound of My Day" and to the
-- Apart missions "Bedtime Story Drop" and "Explain It in a Minute", with the
-- same sealing rules as their other answers.
-- =====================================================================

-- ================================================================ letters
create table public.letters (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  sender_id        uuid not null references auth.users (id) on delete cascade,
  recipient_id     uuid not null references auth.users (id) on delete cascade,
  kind             text not null default 'note'
                   check (kind in ('love', 'note', 'compliment', 'appreciation', 'future', 'surprise')),
  title            text not null default '' check (char_length(title) <= 80),
  body             text not null default '' check (char_length(body) <= 5000),
  image_path       text check (image_path is null or char_length(image_path) <= 300),
  voice_path       text check (voice_path is null or char_length(voice_path) <= 300),
  voice_seconds    int check (voice_seconds is null or voice_seconds between 1 and 130),
  status           text not null default 'draft' check (status in ('draft', 'sent')),
  reveal_at        timestamptz,
  sent_at          timestamptz,
  opened_at        timestamptz,
  loved            boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((status = 'sent') = (sent_at is not null)),
  check (sender_id <> recipient_id)
);
create index letters_recipient_idx on public.letters (recipient_id, status, reveal_at);
create index letters_sender_idx on public.letters (sender_id, created_at desc);

create trigger letters_touch before update on public.letters
  for each row execute function public.touch_updated_at();

-- Has this letter arrived (sent, and its reveal date — if any — has passed)?
create or replace function public.letter_arrived(l public.letters)
returns boolean language sql stable set search_path = '' as $$
  select l.status = 'sent' and (l.reveal_at is null or l.reveal_at <= now());
$$;

create or replace function public.save_letter(
  p_id uuid, p_kind text, p_title text default '', p_body text default '',
  p_image_path text default null, p_voice_path text default null, p_voice_seconds int default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  rel  uuid := public.my_relationship_id();
  l    public.letters%rowtype;
  partner uuid;
  t    text := trim(coalesce(p_title, ''));
  b    text := coalesce(p_body, '');
  img  text := nullif(trim(coalesce(p_image_path, '')), '');
  vox  text := nullif(trim(coalesce(p_voice_path, '')), '');
  pat  text;
begin
  if uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  if p_kind not in ('love', 'note', 'compliment', 'appreciation', 'future', 'surprise') then
    raise exception 'Unknown kind of letter.' using errcode = '22023';
  end if;
  if char_length(t) > 80 then
    raise exception 'Please keep the title under 80 characters.' using errcode = '22001';
  end if;
  if char_length(b) > 5000 then
    raise exception 'That''s a lovely long letter! Please keep it under 5,000 characters.' using errcode = '22001';
  end if;
  if vox is not null and (p_voice_seconds is null or p_voice_seconds not between 1 and 130) then
    raise exception 'Voice notes can be up to two minutes.' using errcode = '22023';
  end if;

  if p_id is null then
    select m.user_id into partner from public.relationship_members m
     join public.relationships r on r.id = m.relationship_id and r.status = 'active'
     where m.relationship_id = rel and m.status = 'active' and m.user_id <> uid;
    if partner is null then
      raise exception 'The mailbox opens once your partner has joined.' using errcode = 'P0001';
    end if;
    if img is not null or vox is not null then
      raise exception 'Save the letter first, then add a photo or voice note.' using errcode = '22023';
    end if;
    if (select count(*) from public.letters where sender_id = uid and status = 'draft') >= 50 then
      raise exception 'You have 50 drafts — send or delete a few first.' using errcode = 'P0001';
    end if;
    insert into public.letters (relationship_id, sender_id, recipient_id, kind, title, body)
    values (rel, uid, partner, p_kind, t, b) returning id into l.id;
    return l.id;
  end if;

  select * into l from public.letters where id = p_id for update;
  if not found or l.sender_id <> uid then
    raise exception 'We couldn''t find that letter.' using errcode = 'P0001';
  end if;
  if l.status <> 'draft' then
    raise exception 'That letter has been sent — it can''t be changed now.' using errcode = 'P0001';
  end if;
  pat := '^' || l.relationship_id::text || '/' || l.id::text || '/' || uid::text || '/[A-Za-z0-9._-]{1,80}$';
  if (img is not null and img !~ pat) or (vox is not null and vox !~ pat) then
    raise exception 'That file can''t be attached here.' using errcode = '22023';
  end if;
  update public.letters
     set kind = p_kind, title = t, body = b, image_path = img, voice_path = vox,
         voice_seconds = case when vox is null then null else p_voice_seconds end
   where id = l.id;
  return l.id;
end;
$$;

create or replace function public.send_letter(p_id uuid, p_reveal_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.letters%rowtype;
begin
  select * into l from public.letters where id = p_id for update;
  if not found or l.sender_id <> auth.uid() then
    raise exception 'We couldn''t find that letter.' using errcode = 'P0001';
  end if;
  if l.status <> 'draft' then
    raise exception 'That letter is already on its way.' using errcode = 'P0001';
  end if;
  if not public.is_member(l.relationship_id) then
    raise exception 'We couldn''t find that letter.' using errcode = 'P0001';
  end if;
  if trim(l.body) = '' and trim(l.title) = '' and l.image_path is null and l.voice_path is null then
    raise exception 'Write something (or add a photo or voice note) before sending.' using errcode = 'P0001';
  end if;
  if l.kind = 'future' and p_reveal_at is null then
    raise exception 'Choose when your future letter should open.' using errcode = 'P0001';
  end if;
  if p_reveal_at is not null and (p_reveal_at < now() + interval '1 minute' or p_reveal_at > now() + interval '5 years') then
    raise exception 'Pick a reveal date in the future (within five years).' using errcode = '22023';
  end if;
  update public.letters set status = 'sent', sent_at = now(), reveal_at = p_reveal_at where id = l.id;
end;
$$;

-- The sender can take a letter back until it has been opened; it returns to drafts.
create or replace function public.take_back_letter(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.letters%rowtype;
begin
  select * into l from public.letters where id = p_id for update;
  if not found or l.sender_id <> auth.uid() or l.status <> 'sent' then
    raise exception 'We couldn''t find that letter.' using errcode = 'P0001';
  end if;
  if l.opened_at is not null then
    raise exception 'It''s already been opened, so it stays.' using errcode = 'P0001';
  end if;
  update public.letters set status = 'draft', sent_at = null, reveal_at = null, loved = false where id = l.id;
end;
$$;

-- Deletes your own draft (the app removes its files first).
create or replace function public.delete_letter_draft(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.letters where id = p_id and sender_id = auth.uid() and status = 'draft';
  if not found then
    raise exception 'Only your own drafts can be deleted.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.open_letter(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.letters%rowtype;
begin
  select * into l from public.letters where id = p_id for update;
  if not found or l.recipient_id <> auth.uid() or not public.letter_arrived(l) then
    raise exception 'That letter hasn''t arrived yet.' using errcode = 'P0001';
  end if;
  update public.letters set opened_at = coalesce(opened_at, now()) where id = l.id;
end;
$$;

-- "Letters we love": shared, either of you can toggle a letter that has reached you both.
create or replace function public.toggle_letter_loved(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare l public.letters%rowtype;
begin
  select * into l from public.letters where id = p_id for update;
  if not found or not public.is_member(l.relationship_id) or not public.letter_arrived(l)
     or auth.uid() not in (l.sender_id, l.recipient_id) then
    raise exception 'We couldn''t find that letter.' using errcode = 'P0001';
  end if;
  update public.letters set loved = not l.loved where id = l.id;
  return not l.loved;
end;
$$;

-- Sealed envelopes on their way to you: kind and date only, never content.
create or replace function public.my_sealed_letters()
returns table (id uuid, kind text, reveal_at timestamptz, sent_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id, l.kind, l.reveal_at, l.sent_at from public.letters l
   where l.recipient_id = auth.uid() and l.status = 'sent' and l.reveal_at > now()
     and public.is_member(l.relationship_id)
   order by l.reveal_at;
$$;

create or replace function public.mailbox_summary()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'unread', (select count(*) from public.letters l where l.recipient_id = auth.uid() and public.letter_arrived(l) and l.opened_at is null),
    'sealed', (select count(*) from public.letters l where l.recipient_id = auth.uid() and l.status = 'sent' and l.reveal_at > now()),
    'next_reveal_at', (select min(l.reveal_at) from public.letters l where l.recipient_id = auth.uid() and l.status = 'sent' and l.reveal_at > now()));
$$;

alter table public.letters enable row level security;
create policy "letters: yours, or arrived for you" on public.letters
  for select to authenticated
  using (public.is_member(relationship_id)
         and (sender_id = auth.uid() or (recipient_id = auth.uid() and status = 'sent' and (reveal_at is null or reveal_at <= now()))));
revoke all on public.letters from anon, authenticated;
grant select on public.letters to authenticated;

-- Storage for letter photos and voice notes: <relationship>/<letter>/<sender>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('letters', 'letters', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_edit_letter_media(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
  rel uuid; lid uuid; usr uuid;
begin
  if array_length(parts, 1) <> 4 then return false; end if;
  begin rel := parts[1]::uuid; lid := parts[2]::uuid; usr := parts[3]::uuid; exception when others then return false; end;
  return usr = auth.uid() and public.is_member(rel)
     and exists (select 1 from public.letters l where l.id = lid and l.relationship_id = rel and l.sender_id = usr and l.status = 'draft');
end;
$$;

create or replace function public.can_view_letter_media(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
  rel uuid; lid uuid; usr uuid;
begin
  if array_length(parts, 1) <> 4 then return false; end if;
  begin rel := parts[1]::uuid; lid := parts[2]::uuid; usr := parts[3]::uuid; exception when others then return false; end;
  if not public.is_member(rel) then return false; end if;
  if usr = auth.uid() then return true; end if;   -- the sender's own files
  return exists (select 1 from public.letters l
                  where l.id = lid and l.relationship_id = rel and l.sender_id = usr and l.recipient_id = auth.uid()
                    and public.letter_arrived(l) and p_name in (l.image_path, l.voice_path));
end;
$$;

create policy "letters bucket: read own or arrived" on storage.objects
  for select to authenticated using (bucket_id = 'letters' and public.can_view_letter_media(name));
create policy "letters bucket: upload to own draft" on storage.objects
  for insert to authenticated with check (bucket_id = 'letters' and public.can_edit_letter_media(name));
create policy "letters bucket: delete from own draft" on storage.objects
  for delete to authenticated using (bucket_id = 'letters' and public.can_edit_letter_media(name));

-- ============================================ voice: Weekly Ritual #23
alter table public.activities add column allow_voice boolean not null default false;
update public.activities set allow_voice = true where code = 23;

alter table public.activity_submissions
  add column voice_path text check (voice_path is null or char_length(voice_path) <= 300),
  add column voice_seconds int check (voice_seconds is null or voice_seconds between 1 and 130);

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/x-m4a']
 where id in ('ritual-media', 'apart-media');

-- Attach or clear a voice note on your draft answer (only for activities that allow voice).
create or replace function public.set_ritual_voice(p_weekly uuid, p_voice_path text, p_voice_seconds int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rel uuid;
  ok  boolean;
  vox text := nullif(trim(coalesce(p_voice_path, '')), '');
  sub public.activity_submissions%rowtype;
begin
  select w.relationship_id, a.allow_voice into rel, ok
    from public.weekly_activities w join public.activities a on a.id = w.activity_id where w.id = p_weekly;
  if rel is null or not public.is_member(rel) then
    raise exception 'We couldn''t find that ritual.' using errcode = 'P0001';
  end if;
  if not ok then
    raise exception 'Voice notes aren''t part of this ritual.' using errcode = 'P0001';
  end if;
  if vox is not null and vox !~ ('^' || rel::text || '/' || p_weekly::text || '/' || uid::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'That voice note can''t be attached here.' using errcode = '22023';
  end if;
  if vox is not null and (p_voice_seconds is null or p_voice_seconds not between 1 and 130) then
    raise exception 'Voice notes can be up to two minutes.' using errcode = '22023';
  end if;
  select * into sub from public.activity_submissions where weekly_activity_id = p_weekly and user_id = uid for update;
  if found and sub.status = 'submitted' then
    raise exception 'You''ve already shared this one — it''s sealed now.' using errcode = 'P0001';
  end if;
  if not found then
    insert into public.activity_submissions (weekly_activity_id, relationship_id, user_id, voice_path, voice_seconds)
    values (p_weekly, rel, uid, vox, case when vox is null then null else p_voice_seconds end);
  else
    update public.activity_submissions set voice_path = vox, voice_seconds = case when vox is null then null else p_voice_seconds end
     where id = sub.id;
  end if;
end;
$$;

-- A voice note counts as an answer when sharing.
create or replace function public.submit_ritual(p_weekly uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  sub  public.activity_submissions%rowtype;
  rtype text;
  has_answer boolean;
begin
  if uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;

  select s.* into sub from public.activity_submissions s
   where s.weekly_activity_id = p_weekly and s.user_id = uid
   for update;
  if not found then
    raise exception 'Write something first, then share it.' using errcode = 'P0001';
  end if;
  if not public.is_member(sub.relationship_id) then
    raise exception 'We couldn''t find that ritual.' using errcode = 'P0001';
  end if;
  if sub.status = 'submitted' then
    return public.week_revealed(p_weekly);   -- already sealed: nothing to do
  end if;

  select a.response_type into rtype
    from public.weekly_activities w join public.activities a on a.id = w.activity_id
   where w.id = p_weekly;

  has_answer := exists (select 1 from jsonb_array_elements(sub.answers) e where coalesce(e ->> 'answer', '') <> '');

  if rtype in ('photo', 'drawing') and sub.image_path is null then
    raise exception 'Add your % before sharing.', case when rtype = 'photo' then 'photo' else 'drawing' end using errcode = 'P0001';
  end if;
  if trim(sub.body) = '' and sub.image_path is null and sub.voice_path is null and not has_answer and sub.link_url is null then
    raise exception 'Write something first, then share it.' using errcode = 'P0001';
  end if;

  -- Lock the week so the two submissions can't race past each other.
  perform 1 from public.weekly_activities w where w.id = p_weekly for update;
  update public.activity_submissions set status = 'submitted', submitted_at = now() where id = sub.id;

  return public.week_revealed(p_weekly);
end;
$$;

-- The partner may hear a voice note only after the reveal, like photos.
create or replace function public.can_view_ritual_media(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
  rel uuid; wk uuid; usr uuid;
begin
  if array_length(parts, 1) <> 4 then return false; end if;
  begin
    rel := parts[1]::uuid; wk := parts[2]::uuid; usr := parts[3]::uuid;
  exception when others then
    return false;
  end;
  if not public.is_member(rel) then return false; end if;
  if usr = auth.uid() then return true; end if;
  -- The partner's file is visible only if it is the image on their submitted answer and the week is revealed.
  return public.week_revealed(wk)
     and exists (select 1 from public.activity_submissions s
                  where s.weekly_activity_id = wk and s.user_id = usr
                    and s.status = 'submitted' and p_name in (s.image_path, s.voice_path));
end;
$$;

-- ============================================ voice: Apart missions
alter table public.play_activities add column allow_voice boolean not null default false;
update public.play_activities set allow_voice = true, share_as = 'Text or voice' where code in (117, 136);

alter table public.apart_entries
  add column voice_path text check (voice_path is null or char_length(voice_path) <= 300),
  add column voice_seconds int check (voice_seconds is null or voice_seconds between 1 and 130);
alter table public.apart_entries drop constraint if exists apart_entries_check;
alter table public.apart_entries add constraint apart_entries_has_content
  check (body <> '' or link_url is not null or image_path is not null or voice_path is not null);

drop function public.add_apart_entry(uuid, text, text, text);
create or replace function public.add_apart_entry(p_mission uuid, p_body text default '', p_link_url text default null, p_image_path text default null,
                                                  p_voice_path text default null, p_voice_seconds int default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  m    public.apart_missions%rowtype;
  link text := nullif(trim(coalesce(p_link_url, '')), '');
  img  text := nullif(trim(coalesce(p_image_path, '')), '');
  vox  text := nullif(trim(coalesce(p_voice_path, '')), '');
  b    text := trim(coalesce(p_body, ''));
  eid  uuid;
begin
  select * into m from public.apart_missions where id = p_mission for update;
  if not found or not public.is_member(m.relationship_id) then
    raise exception 'That mission isn''t available.' using errcode = 'P0001';
  end if;
  if m.closed_at is not null then
    raise exception 'That mission is closed.' using errcode = 'P0001';
  end if;
  if char_length(b) > 2000 then
    raise exception 'Please keep it under 2,000 characters.' using errcode = '22001';
  end if;
  if link is not null and (link !~ '^https://[^\s]+$' or char_length(link) > 500) then
    raise exception 'Links need to start with https://' using errcode = '22023';
  end if;
  if img is not null and img !~ ('^' || m.relationship_id::text || '/' || m.id::text || '/' || uid::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'That image can''t be attached here.' using errcode = '22023';
  end if;
  if vox is not null then
    if not exists (select 1 from public.play_activities a where a.id = m.activity_id and a.allow_voice) then
      raise exception 'Voice notes aren''t part of this mission.' using errcode = 'P0001';
    end if;
    if vox !~ ('^' || m.relationship_id::text || '/' || m.id::text || '/' || uid::text || '/[A-Za-z0-9._-]{1,80}$') then
      raise exception 'That voice note can''t be attached here.' using errcode = '22023';
    end if;
    if p_voice_seconds is null or p_voice_seconds not between 1 and 130 then
      raise exception 'Voice notes can be up to two minutes.' using errcode = '22023';
    end if;
  end if;
  if b = '' and link is null and img is null and vox is null then
    raise exception 'Add some words, a photo, a link or a voice note first.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.apart_entries where mission_id = m.id) >= 100 then
    raise exception 'This mission is full — start a new one!' using errcode = 'P0001';
  end if;
  insert into public.apart_entries (mission_id, relationship_id, user_id, body, link_url, image_path, voice_path, voice_seconds)
  values (m.id, m.relationship_id, uid, b, link, img, vox, case when vox is null then null else p_voice_seconds end) returning id into eid;
  return eid;
end;
$$;

create or replace function public.can_edit_apart_media(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
  rel uuid; mid uuid; usr uuid;
begin
  if array_length(parts, 1) <> 4 then return false; end if;
  begin rel := parts[1]::uuid; mid := parts[2]::uuid; usr := parts[3]::uuid; exception when others then return false; end;
  return usr = auth.uid() and public.is_member(rel)
     and exists (select 1 from public.apart_missions m where m.id = mid and m.relationship_id = rel and m.closed_at is null)
     and not exists (select 1 from public.apart_entries e where p_name in (e.image_path, e.voice_path));  -- attached files are final
end;
$$;

create or replace function public.can_view_apart_media(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
  rel uuid; mid uuid; usr uuid;
begin
  if array_length(parts, 1) <> 4 then return false; end if;
  begin rel := parts[1]::uuid; mid := parts[2]::uuid; usr := parts[3]::uuid; exception when others then return false; end;
  if not public.is_member(rel) then return false; end if;
  if usr = auth.uid() then return true; end if;
  return public.apart_visible(mid)
     and exists (select 1 from public.apart_entries e where e.mission_id = mid and e.user_id = usr and p_name in (e.image_path, e.voice_path));
end;
$$;

-- ============================================================ grants
revoke execute on function
  public.letter_arrived(public.letters), public.save_letter(uuid, text, text, text, text, text, int), public.send_letter(uuid, timestamptz),
  public.take_back_letter(uuid), public.delete_letter_draft(uuid), public.open_letter(uuid), public.toggle_letter_loved(uuid),
  public.my_sealed_letters(), public.mailbox_summary(), public.can_edit_letter_media(text), public.can_view_letter_media(text),
  public.set_ritual_voice(uuid, text, int), public.add_apart_entry(uuid, text, text, text, text, int)
  from public, anon;
revoke execute on function public.letter_arrived(public.letters) from authenticated;
grant execute on function
  public.save_letter(uuid, text, text, text, text, text, int), public.send_letter(uuid, timestamptz),
  public.take_back_letter(uuid), public.delete_letter_draft(uuid), public.open_letter(uuid), public.toggle_letter_loved(uuid),
  public.my_sealed_letters(), public.mailbox_summary(), public.can_edit_letter_media(text), public.can_view_letter_media(text),
  public.set_ritual_voice(uuid, text, int), public.add_apart_entry(uuid, text, text, text, text, int)
  to authenticated;
