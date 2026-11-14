-- =====================================================================
-- Our Little Ritual — Phase 4: Quick wins
-- visits (countdown) · nudges ("thinking of you") · usual free hours
-- =====================================================================

-- --------------------------------------------------------------- visits
-- Dates are plain calendar dates (no time zone): "16 Dec" means 16 Dec for
-- both of you. Either partner can add, edit or remove a visit.
create table public.visits (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  created_by       uuid not null references auth.users (id) on delete set null,
  place            text not null check (char_length(place) between 1 and 60),
  starts_on        date not null,
  ends_on          date,
  note             text not null default '' check (char_length(note) <= 280),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index visits_relationship_idx on public.visits (relationship_id, starts_on);
create trigger visits_touch before update on public.visits
  for each row execute function public.touch_updated_at();

-- -------------------------------------------------------------- nudges
create table public.nudges (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  sender_id        uuid not null references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now()
);
create index nudges_relationship_idx on public.nudges (relationship_id, created_at desc);

-- -------------------------------------------------- usual free hours
-- Local times in the person's own time zone. A window may cross midnight
-- (e.g. 22:00–01:00). Both null = not set.
alter table public.profiles
  add column free_from time,
  add column free_to   time,
  add constraint profiles_free_window check ((free_from is null) = (free_to is null) and (free_from is null or free_from <> free_to));

grant update (free_from, free_to) on public.profiles to authenticated;

-- ============================================================ visits RPCs
create or replace function public.save_visit(
  p_id uuid, p_place text, p_starts_on date, p_ends_on date default null, p_note text default ''
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_rel   uuid := public.my_relationship_id();
  v_id    uuid;
  v_place text := trim(coalesce(p_place, ''));
  v_note  text := trim(coalesce(p_note, ''));
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  if v_rel is null then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
  if char_length(v_place) < 1 or char_length(v_place) > 60 then
    raise exception 'Where are you meeting? (up to 60 characters)' using errcode = '22023';
  end if;
  if p_starts_on is null then
    raise exception 'Please choose the date you''ll see each other.' using errcode = '22023';
  end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'The last day can''t be before the first day.' using errcode = '22023';
  end if;
  if p_starts_on < current_date - 30 or p_starts_on > current_date + 3650 then
    raise exception 'Please choose a date within the next ten years.' using errcode = '22023';
  end if;
  if char_length(v_note) > 280 then
    raise exception 'Please keep the note under 280 characters.' using errcode = '22001';
  end if;

  if p_id is null then
    if (select count(*) from public.visits v where v.relationship_id = v_rel) >= 100 then
      raise exception 'That''s a lot of visits! Remove some old ones first.' using errcode = 'P0001';
    end if;
    insert into public.visits (relationship_id, created_by, place, starts_on, ends_on, note)
    values (v_rel, auth.uid(), v_place, p_starts_on, p_ends_on, v_note)
    returning id into v_id;
  else
    update public.visits v
       set place = v_place, starts_on = p_starts_on, ends_on = p_ends_on, note = v_note
     where v.id = p_id and v.relationship_id = v_rel
    returning v.id into v_id;
    if v_id is null then
      raise exception 'We couldn''t find that visit.' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_visit(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.visits where id = p_id and relationship_id = public.my_relationship_id();
  if not found then
    raise exception 'We couldn''t find that visit.' using errcode = 'P0001';
  end if;
end;
$$;

-- ============================================================ nudge RPC
-- Gentle limits so a tap can't turn into spam: one a minute, 30 a day.
create or replace function public.send_nudge()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rel uuid := public.my_relationship_id();
  ts  timestamptz;
begin
  if uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  if rel is null or not exists (select 1 from public.relationships r where r.id = rel and r.status = 'active') then
    raise exception 'You can send these once your partner has joined.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.nudges n where n.sender_id = uid and n.created_at > now() - interval '60 seconds') then
    raise exception 'Sent! Give it a minute before the next one.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.nudges n where n.sender_id = uid and n.created_at > now() - interval '24 hours') >= 30 then
    raise exception 'That''s a lot of love for one day — they know! Try again tomorrow.' using errcode = 'P0001';
  end if;
  insert into public.nudges (relationship_id, sender_id) values (rel, uid) returning created_at into ts;
  return ts;
end;
$$;

-- ================================================================== RLS
alter table public.visits enable row level security;
alter table public.nudges enable row level security;

create policy "visits: members read" on public.visits
  for select to authenticated using (public.is_member(relationship_id));
create policy "nudges: members read" on public.nudges
  for select to authenticated using (public.is_member(relationship_id));

revoke all on public.visits, public.nudges from anon, authenticated;
grant select on public.visits, public.nudges to authenticated;

revoke execute on function
  public.save_visit(uuid, text, date, date, text), public.delete_visit(uuid), public.send_nudge()
  from public, anon;
grant execute on function
  public.save_visit(uuid, text, date, date, text), public.delete_visit(uuid), public.send_nudge()
  to authenticated;
