-- =====================================================================
-- Our Little Ritual — A Little Whim (approved by Vee, 15 Nov 2026)
--
-- Lives in the Mailbox (Letters · Whims). Two kinds:
--   Little Want  — something one of you would love; the other answers:
--                  Maybe someday · Yes! Let's get it, Puffin! · I'll surprise you
--                  · Bought! · Not right now
--   Shared Wish  — something for the two of you; either of you moves it along:
--                  Let's plan it · Saving up · Done together! · Maybe someday
--                  · Not right now
-- "I'll surprise you" hides the answer (and anything after it) from the person
-- who asked until the giver reveals it — enforced here, not just in the app.
-- No payments, no shopping integrations, no link previews, no reminders.
-- =====================================================================

create table public.whims (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  created_by       uuid not null references auth.users (id) on delete cascade,
  kind             text not null check (kind in ('little_want', 'shared_wish')),
  name             text not null check (char_length(name) between 1 and 80),
  link             text check (link is null or (char_length(link) <= 500 and link ~ '^https://[^\s]+$')),
  price            numeric(12, 2) check (price is null or price >= 0),
  currency         text check (currency is null or currency in ('RM', 'SEK', 'CLP')),
  message          text not null default '' check (char_length(message) <= 500),
  photo_path       text check (photo_path is null or char_length(photo_path) <= 300),
  status           text not null check (status in ('new', 'maybe', 'yes', 'surprise', 'bought', 'not_now', 'plan', 'saving', 'done')),
  status_by        uuid references auth.users (id) on delete set null,
  status_at        timestamptz not null default now(),
  response_note    text not null default '' check (char_length(response_note) <= 300),
  surprise         boolean not null default false,     -- answer hidden from the asker until revealed
  revealed_at      timestamptz,
  archived         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((price is null) = (currency is null)),
  check (kind = 'little_want' and status in ('new', 'maybe', 'yes', 'surprise', 'bought', 'not_now')
      or kind = 'shared_wish' and status in ('plan', 'saving', 'done', 'maybe', 'not_now')),
  check (not surprise or kind = 'little_want')
);
create index whims_rel_idx on public.whims (relationship_id, archived, created_at desc);
create trigger whims_touch before update on public.whims
  for each row execute function public.touch_updated_at();

-- A wish that came true: a Little Want bought (and revealed), or a Shared Wish done together.
create or replace function public.whim_came_true(w public.whims)
returns boolean language sql stable set search_path = '' as $$
  select (w.kind = 'little_want' and w.status = 'bought' and not w.surprise) or (w.kind = 'shared_wish' and w.status = 'done');
$$;

create or replace function public.save_whim(
  p_id uuid, p_kind text, p_name text, p_link text default null, p_price numeric default null,
  p_currency text default null, p_message text default '', p_photo_path text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  rel  uuid := public.my_relationship_id();
  w    public.whims%rowtype;
  n    text := trim(coalesce(p_name, ''));
  lk   text := nullif(trim(coalesce(p_link, '')), '');
  msg  text := trim(coalesce(p_message, ''));
  img  text := nullif(trim(coalesce(p_photo_path, '')), '');
begin
  if uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  if rel is null or not exists (select 1 from public.relationships r where r.id = rel and r.status = 'active') then
    raise exception 'Whims open once your partner has joined.' using errcode = 'P0001';
  end if;
  if p_kind not in ('little_want', 'shared_wish') then
    raise exception 'Unknown kind of whim.' using errcode = '22023';
  end if;
  if n = '' then
    raise exception 'Give your whim a name first.' using errcode = '22023';
  end if;
  if char_length(n) > 80 then
    raise exception 'Please keep the name under 80 characters.' using errcode = '22001';
  end if;
  if char_length(msg) > 500 then
    raise exception 'Please keep the message under 500 characters.' using errcode = '22001';
  end if;
  if lk is not null and (lk !~ '^https://[^\s]+$' or char_length(lk) > 500) then
    raise exception 'Links need to start with https://' using errcode = '22023';
  end if;
  if p_price is not null and (p_price < 0 or p_price > 9999999999) then
    raise exception 'That price doesn''t look right.' using errcode = '22023';
  end if;
  if (p_price is null) <> (nullif(p_currency, '') is null) or (p_currency is not null and p_currency <> '' and p_currency not in ('RM', 'SEK', 'CLP')) then
    raise exception 'Pick RM, SEK or CLP for the price.' using errcode = '22023';
  end if;

  if p_id is null then
    if img is not null then
      raise exception 'Save the whim first, then add a photo.' using errcode = '22023';
    end if;
    if (select count(*) from public.whims where relationship_id = rel and not archived) >= 200 then
      raise exception 'That''s a lot of whims! Put a few away first.' using errcode = 'P0001';
    end if;
    insert into public.whims (relationship_id, created_by, kind, name, link, price, currency, message, status, status_by)
    values (rel, uid, p_kind, n, lk, p_price, nullif(p_currency, ''), msg,
            case when p_kind = 'little_want' then 'new' else 'plan' end, uid)
    returning id into w.id;
    return w.id;
  end if;

  select * into w from public.whims where id = p_id and relationship_id = rel for update;
  if not found or w.created_by <> uid then
    raise exception 'We couldn''t find that whim.' using errcode = 'P0001';
  end if;
  if w.surprise or w.status in ('bought', 'done') then
    raise exception 'This one''s already in motion — it can''t be changed now.' using errcode = 'P0001';
  end if;
  if p_kind <> w.kind then
    raise exception 'A whim can''t change kind — start a new one instead.' using errcode = '22023';
  end if;
  if img is not null and img !~ ('^' || rel::text || '/' || w.id::text || '/' || uid::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'That photo can''t be attached here.' using errcode = '22023';
  end if;
  update public.whims
     set name = n, link = lk, price = p_price, currency = nullif(p_currency, ''), message = msg, photo_path = img
   where id = w.id;
  return w.id;
end;
$$;

-- Answer a Little Want (the other person) or move a Shared Wish along (either of you).
create or replace function public.set_whim_status(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  w   public.whims%rowtype;
  nt  text := case when p_note is null then null else trim(p_note) end;
begin
  select * into w from public.whims where id = p_id and relationship_id = public.my_relationship_id() for update;
  if not found then
    raise exception 'We couldn''t find that whim.' using errcode = 'P0001';
  end if;
  if nt is not null and char_length(nt) > 300 then
    raise exception 'Please keep the note under 300 characters.' using errcode = '22001';
  end if;
  if w.kind = 'little_want' then
    if w.created_by = uid then
      raise exception 'This one''s for your partner to answer.' using errcode = 'P0001';
    end if;
    if p_status not in ('maybe', 'yes', 'surprise', 'bought', 'not_now') then
      raise exception 'Unknown answer.' using errcode = '22023';
    end if;
    if w.status = 'bought' and not w.surprise then
      raise exception 'This one''s already bought!' using errcode = 'P0001';
    end if;
    -- once a surprise, it stays hidden until you reveal it (you can still mark it bought)
    update public.whims
       set status = p_status, status_by = uid, status_at = now(),
           response_note = coalesce(nt, response_note),
           surprise = surprise or p_status = 'surprise'
     where id = w.id;
  else
    if p_status not in ('plan', 'saving', 'done', 'maybe', 'not_now') then
      raise exception 'Unknown status.' using errcode = '22023';
    end if;
    update public.whims
       set status = p_status, status_by = uid, status_at = now(), response_note = coalesce(nt, response_note)
     where id = w.id;
  end if;
end;
$$;

-- The giver reveals a surprise (it becomes "Bought!" for both of you).
create or replace function public.reveal_whim(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  w public.whims%rowtype;
begin
  select * into w from public.whims where id = p_id and relationship_id = public.my_relationship_id() for update;
  if not found or not w.surprise or w.created_by = auth.uid() then
    raise exception 'There''s no surprise of yours to reveal here.' using errcode = 'P0001';
  end if;
  update public.whims set status = 'bought', surprise = false, revealed_at = now(), status_at = now(), status_by = auth.uid()
   where id = w.id;
end;
$$;

create or replace function public.archive_whim(p_id uuid, p_archived boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.whims set archived = coalesce(p_archived, true)
   where id = p_id and relationship_id = public.my_relationship_id()
     and not (surprise and created_by = auth.uid());   -- the asker can't tidy away a surprise in progress
  if not found then
    raise exception 'We couldn''t find that whim.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.delete_whim(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  w public.whims%rowtype;
begin
  select * into w from public.whims where id = p_id and relationship_id = public.my_relationship_id() for update;
  if not found or w.created_by <> auth.uid() then
    raise exception 'Only the person who added a whim can delete it.' using errcode = 'P0001';
  end if;
  if w.surprise or public.whim_came_true(w) then
    raise exception 'This one''s part of your story now — you can put it away instead.' using errcode = 'P0001';
  end if;
  delete from public.scrapbook_entries where relationship_id = w.relationship_id and kind = 'whim' and ref_id = w.id;
  delete from public.whims where id = w.id;
  return w.photo_path;   -- so the app can tidy up the photo
end;
$$;

-- Everything for the Whims list. The asker sees a surprise only as "in the works".
create or replace function public.my_whims()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'kind', w.kind, 'created_by', w.created_by, 'name', w.name, 'link', w.link,
           'price', w.price, 'currency', w.currency, 'message', w.message, 'photo_path', w.photo_path,
           'status',        case when hidden then 'in_the_works' else w.status end,
           'status_by',     case when hidden then null else w.status_by end,
           'status_at',     case when hidden then w.created_at else w.status_at end,
           'response_note', case when hidden then '' else w.response_note end,
           'surprise',      w.surprise and not hidden,
           'revealed_at',   w.revealed_at, 'archived', w.archived, 'created_at', w.created_at)
         order by w.created_at desc), '[]'::jsonb)
    from (select x.*, (x.surprise and x.created_by = auth.uid()) as hidden
            from public.whims x where x.relationship_id = public.my_relationship_id()) w;
$$;

-- ------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whims', 'whims', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- <relationship>/<whim>/<who added it>/<file>. Both of you can see it; only the person who added the whim uploads.
create or replace function public.can_use_whim_media(p_name text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_name, '/');
  rel uuid; wid uuid; usr uuid;
begin
  if array_length(parts, 1) <> 4 then return false; end if;
  begin rel := parts[1]::uuid; wid := parts[2]::uuid; usr := parts[3]::uuid; exception when others then return false; end;
  return public.is_member(rel)
     and exists (select 1 from public.whims w where w.id = wid and w.relationship_id = rel and w.created_by = usr)
     and (not p_write or usr = auth.uid());
end;
$$;

create or replace function public.whim_photo_in_use(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.whims w where w.photo_path = p_name);
$$;

create policy "whims bucket: members read" on storage.objects
  for select to authenticated using (bucket_id = 'whims' and public.can_use_whim_media(name, false));
create policy "whims bucket: upload to own whim" on storage.objects
  for insert to authenticated with check (bucket_id = 'whims' and public.can_use_whim_media(name, true));
create policy "whims bucket: delete own unattached" on storage.objects
  for delete to authenticated using (bucket_id = 'whims' and public.can_use_whim_media(name, true)
                                     and not public.whim_photo_in_use(name));

-- ------------------------------------------------------------------ RLS
-- No direct reads at all: a surprise must stay hidden, so everything goes through my_whims().
alter table public.whims enable row level security;
revoke all on public.whims from anon, authenticated;

-- ------------------------------------------------------ scrapbook: kind 'whim'
alter table public.scrapbook_entries drop constraint if exists scrapbook_entries_kind_check;
alter table public.scrapbook_entries add constraint scrapbook_entries_kind_check
  check (kind in ('ritual', 'mission', 'letter', 'discovery', 'milestone', 'moment', 'whim'));

create or replace function public.scrapbook_item_ok(p_rel uuid, p_kind text, p_ref uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'ritual'    then exists (select 1 from public.weekly_activities w where w.id = p_ref and w.relationship_id = p_rel) and public.week_revealed(p_ref)
    when 'mission'   then exists (select 1 from public.apart_missions m where m.id = p_ref and m.relationship_id = p_rel) and public.apart_visible(p_ref)
    when 'letter'    then exists (select 1 from public.letters l where l.id = p_ref and l.relationship_id = p_rel and public.letter_arrived(l))
    when 'discovery' then exists (select 1 from public.curious_discoveries d where d.id = p_ref and d.relationship_id = p_rel)
    when 'milestone' then exists (select 1 from public.milestones x where x.id = p_ref and x.relationship_id = p_rel)
    when 'moment'    then exists (select 1 from public.moments x where x.id = p_ref and x.relationship_id = p_rel)
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
  if p_kind not in ('ritual', 'mission', 'letter', 'discovery', 'milestone', 'moment', 'whim') then
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
      ) x
  ), '[]'::jsonb);
end;
$$;

-- ------------------------------------------- For you: a new whim from your partner
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

revoke execute on function
  public.whim_came_true(public.whims), public.save_whim(uuid, text, text, text, numeric, text, text, text),
  public.set_whim_status(uuid, text, text), public.reveal_whim(uuid), public.archive_whim(uuid, boolean),
  public.delete_whim(uuid), public.my_whims(), public.can_use_whim_media(text, boolean), public.whim_photo_in_use(text)
  from public, anon;
revoke execute on function public.whim_came_true(public.whims) from authenticated;
grant execute on function
  public.save_whim(uuid, text, text, text, numeric, text, text, text), public.set_whim_status(uuid, text, text),
  public.reveal_whim(uuid), public.archive_whim(uuid, boolean), public.delete_whim(uuid), public.my_whims(),
  public.can_use_whim_media(text, boolean), public.whim_photo_in_use(text)
  to authenticated;
revoke execute on function public.scrapbook_item_ok(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.for_you(), public.scrapbook_feed(), public.set_scrapbook_entry(text, uuid, boolean, text) from public, anon;
grant execute on function public.for_you(), public.scrapbook_feed(), public.set_scrapbook_entry(text, uuid, boolean, text) to authenticated;
