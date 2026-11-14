-- =====================================================================
-- Our Little Ritual — Phase 3: Submissions and the sealed reveal
-- activity_submissions · private storage bucket "ritual-media"
--
-- The reveal rule, enforced by the database (not by the app):
--   * You can always read your own submission, draft or sent.
--   * Your partner's submission is readable ONLY when both of you have
--     submitted for that week. Before that, no query, API call or file
--     download can return it — not even a "submitted" row's text.
--   * Before the reveal you can see whether your partner has submitted
--     (yes / not yet, via week_status()) — never what they wrote.
--   * Once submitted, a response is locked: no edits, no file changes.
--   * Drafts are private forever; they are never shown to the partner.
--   * Any week can be answered late. There is no deadline.
-- =====================================================================

create table public.activity_submissions (
  id                  uuid primary key default gen_random_uuid(),
  weekly_activity_id  uuid not null references public.weekly_activities (id) on delete cascade,
  relationship_id     uuid not null references public.relationships (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  status              text not null default 'draft' check (status in ('draft', 'submitted')),
  body                text not null default '' check (char_length(body) <= 5000),
  link_url            text check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 500)),
  answers             jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  image_path          text check (image_path is null or char_length(image_path) <= 300),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  submitted_at        timestamptz,
  unique (weekly_activity_id, user_id),
  check ((status = 'submitted') = (submitted_at is not null))
);
create index activity_submissions_week_idx on public.activity_submissions (weekly_activity_id);

create trigger activity_submissions_touch before update on public.activity_submissions
  for each row execute function public.touch_updated_at();

-- ============================================================ helpers

-- Has every member of the space submitted for this week (and is the caller a member)?
create or replace function public.week_revealed(p_weekly uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.weekly_activities w
     where w.id = p_weekly
       and public.is_member(w.relationship_id)
       and (select count(*) from public.activity_submissions s
             where s.weekly_activity_id = w.id and s.status = 'submitted') >= 2
  );
$$;

-- Who has shared this week? Yes / not yet only — never any content.
create or replace function public.week_status(p_weekly uuid)
returns table (user_id uuid, has_submitted boolean, submitted_at timestamptz, is_me boolean, revealed boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  rel uuid;
begin
  select w.relationship_id into rel from public.weekly_activities w where w.id = p_weekly;
  if rel is null or not public.is_member(rel) then
    raise exception 'We couldn''t find that ritual.' using errcode = 'P0001';
  end if;
  return query
    select m.user_id,
           coalesce(s.status = 'submitted', false),
           s.submitted_at,
           m.user_id = auth.uid(),
           public.week_revealed(p_weekly)
      from public.relationship_members m
      left join public.activity_submissions s
        on s.weekly_activity_id = p_weekly and s.user_id = m.user_id
     where m.relationship_id = rel and m.status = 'active'
     order by (m.user_id = auth.uid()) desc;
end;
$$;

-- Normalise and validate the structured answers list:
-- at most 8 items of {prompt, answer, guess?}, each a short string.
create or replace function public.clean_answers(p_answers jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  out  jsonb := '[]'::jsonb;
begin
  if p_answers is null then return out; end if;
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 8 then
    raise exception 'Please keep it to 8 answers or fewer.' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(p_answers) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Those answers look malformed. Please try again.' using errcode = '22023';
    end if;
    if char_length(coalesce(item ->> 'prompt', '')) > 200
       or char_length(coalesce(item ->> 'answer', '')) > 300
       or char_length(coalesce(item ->> 'guess', '')) > 300 then
      raise exception 'One of your answers is a little long. Please shorten it.' using errcode = '22001';
    end if;
    out := out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'prompt', trim(coalesce(item ->> 'prompt', '')),
      'answer', trim(coalesce(item ->> 'answer', '')),
      'guess',  nullif(trim(coalesce(item ->> 'guess', '')), ''))));
  end loop;
  return out;
end;
$$;

-- ======================================================== RPC: save
-- Create or update the caller's draft for a week of their own space.
create or replace function public.save_ritual_draft(
  p_weekly uuid, p_body text default '', p_link_url text default null,
  p_answers jsonb default '[]'::jsonb, p_image_path text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  rel  uuid;
  sid  uuid;
  st   text;
  link text := nullif(trim(coalesce(p_link_url, '')), '');
  img  text := nullif(trim(coalesce(p_image_path, '')), '');
begin
  if uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  select w.relationship_id into rel from public.weekly_activities w where w.id = p_weekly;
  if rel is null or not public.is_member(rel) then
    raise exception 'We couldn''t find that ritual.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_body, '')) > 5000 then
    raise exception 'That''s a lovely long answer! Please keep it under 5,000 characters.' using errcode = '22001';
  end if;
  if link is not null and (link !~ '^https://[^\s]+$' or char_length(link) > 500) then
    raise exception 'Links need to start with https://' using errcode = '22023';
  end if;
  -- An image must live in the caller's own folder for this week.
  if img is not null and img !~ ('^' || rel::text || '/' || p_weekly::text || '/' || uid::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'That image can''t be attached here.' using errcode = '22023';
  end if;

  select s.id, s.status into sid, st from public.activity_submissions s
   where s.weekly_activity_id = p_weekly and s.user_id = uid
   for update;
  if st = 'submitted' then
    raise exception 'You''ve already shared this one — it''s sealed now.' using errcode = 'P0001';
  end if;

  if sid is null then
    insert into public.activity_submissions (weekly_activity_id, relationship_id, user_id, body, link_url, answers, image_path)
    values (p_weekly, rel, uid, coalesce(p_body, ''), link, public.clean_answers(p_answers), img)
    returning id into sid;
  else
    update public.activity_submissions
       set body = coalesce(p_body, ''), link_url = link,
           answers = public.clean_answers(p_answers), image_path = img
     where id = sid;
  end if;
  return sid;
end;
$$;

-- ====================================================== RPC: submit
-- Seal the caller's draft. Returns true if this completed the reveal.
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
  if trim(sub.body) = '' and sub.image_path is null and not has_answer and sub.link_url is null then
    raise exception 'Write something first, then share it.' using errcode = 'P0001';
  end if;

  -- Lock the week so the two submissions can't race past each other.
  perform 1 from public.weekly_activities w where w.id = p_weekly for update;
  update public.activity_submissions set status = 'submitted', submitted_at = now() where id = sub.id;

  return public.week_revealed(p_weekly);
end;
$$;

-- ============================================ RPC: statuses for lists
-- For every week of the caller's space: my state and whether my partner has shared.
-- Status only — no content.
create or replace function public.my_ritual_statuses()
returns table (weekly_id uuid, my_status text, partner_submitted boolean, revealed boolean)
language sql stable security definer set search_path = '' as $$
  select w.id,
         coalesce(mine.status, 'none'),
         coalesce(theirs.status = 'submitted', false),
         coalesce(mine.status = 'submitted' and theirs.status = 'submitted', false)
    from public.weekly_activities w
    left join public.activity_submissions mine
      on mine.weekly_activity_id = w.id and mine.user_id = auth.uid()
    left join public.activity_submissions theirs
      on theirs.weekly_activity_id = w.id and theirs.user_id <> auth.uid()
   where w.relationship_id = public.my_relationship_id()
     and w.week_start <= now();
$$;

-- ================================================================ RLS
alter table public.activity_submissions enable row level security;

-- Own row always; partner's row only once both have submitted.
create policy "submissions: own, or partner's after reveal" on public.activity_submissions
  for select to authenticated
  using (
    user_id = auth.uid()
    or (status = 'submitted' and public.week_revealed(weekly_activity_id))
  );

revoke all on public.activity_submissions from anon, authenticated;
grant select on public.activity_submissions to authenticated;

revoke execute on function
  public.week_revealed(uuid), public.week_status(uuid), public.clean_answers(jsonb),
  public.save_ritual_draft(uuid, text, text, jsonb, text), public.submit_ritual(uuid),
  public.my_ritual_statuses()
  from public, anon;
grant execute on function
  public.week_revealed(uuid), public.week_status(uuid),
  public.save_ritual_draft(uuid, text, text, jsonb, text), public.submit_ritual(uuid),
  public.my_ritual_statuses()
  to authenticated;

-- ============================================================ storage
-- Private bucket. Paths: <relationship_id>/<weekly_id>/<user_id>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ritual-media', 'ritual-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Is the caller still allowed to change files in this week-folder (their own, not yet submitted)?
create or replace function public.can_edit_ritual_media(p_name text)
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
  return usr = auth.uid()
     and public.is_member(rel)
     and exists (select 1 from public.weekly_activities w where w.id = wk and w.relationship_id = rel)
     and not exists (select 1 from public.activity_submissions s
                      where s.weekly_activity_id = wk and s.user_id = usr and s.status = 'submitted');
end;
$$;

-- May the caller view this file? Their own always; the partner's only after the reveal.
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
                    and s.status = 'submitted' and s.image_path = p_name);
end;
$$;

revoke execute on function public.can_edit_ritual_media(text), public.can_view_ritual_media(text) from public, anon;
grant execute on function public.can_edit_ritual_media(text), public.can_view_ritual_media(text) to authenticated;

create policy "ritual-media: read own or revealed" on storage.objects
  for select to authenticated
  using (bucket_id = 'ritual-media' and public.can_view_ritual_media(name));
create policy "ritual-media: upload to own open week" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ritual-media' and public.can_edit_ritual_media(name));
create policy "ritual-media: replace own before sharing" on storage.objects
  for update to authenticated
  using (bucket_id = 'ritual-media' and public.can_edit_ritual_media(name))
  with check (bucket_id = 'ritual-media' and public.can_edit_ritual_media(name));
create policy "ritual-media: delete own before sharing" on storage.objects
  for delete to authenticated
  using (bucket_id = 'ritual-media' and public.can_edit_ritual_media(name));
