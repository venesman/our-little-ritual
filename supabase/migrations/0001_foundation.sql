-- =====================================================================
-- Our Little Ritual — Phase 1: Foundation
-- profiles, relationships, relationship_members, invitations
--
-- Run once on a fresh Supabase project (SQL Editor -> paste -> Run),
-- or with the Supabase CLI: `supabase db push`.
--
-- Security model
--   * Every table has Row Level Security enabled.
--   * Clients can READ what they are allowed to see, but cannot write to
--     relationships / members / invitations directly. All writes go through
--     SECURITY DEFINER functions below, which validate membership on the
--     server and take row locks so two people can't race each other.
--   * Invitation tokens are 256-bit random values. Only their SHA-256 hash
--     is stored; the raw token exists once, in the creator's browser.
--   * A relationship can never have more than two active members. This is
--     enforced twice: inside accept_invitation() and by a trigger.
-- =====================================================================

-- Supabase installs pgcrypto in the "extensions" schema. All functions here
-- use an empty search_path and fully-qualified names, so nothing can be
-- hijacked by objects created in another schema.
create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------- profiles
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default ''
                check (char_length(display_name) <= 40),
  timezone      text not null default 'UTC'
                check (char_length(timezone) between 1 and 64),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------- relationships
create table public.relationships (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default 'Our Little Ritual'
                check (char_length(name) between 1 and 60),
  status        text not null default 'pending'
                check (status in ('pending', 'active')),
  created_by    uuid not null references auth.users (id) on delete restrict,
  created_at    timestamptz not null default now(),
  activated_at  timestamptz
);

-- ------------------------------------------------ relationship_members
create table public.relationship_members (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  role             text not null check (role in ('creator', 'partner')),
  status           text not null default 'active' check (status in ('active', 'left')),
  joined_at        timestamptz not null default now(),
  unique (relationship_id, user_id)
);

-- A person can be an active member of only one relationship space.
create unique index relationship_members_one_active_space
  on public.relationship_members (user_id) where status = 'active';
create index relationship_members_relationship_idx
  on public.relationship_members (relationship_id) where status = 'active';

-- ---------------------------------------------------------- invitations
create table public.invitations (
  id               uuid primary key default gen_random_uuid(),
  relationship_id  uuid not null references public.relationships (id) on delete cascade,
  token_hash       text not null unique,          -- hex SHA-256 of the raw token
  created_by       uuid not null references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  redeemed_by      uuid references auth.users (id) on delete set null,
  redeemed_at      timestamptz,
  revoked_at       timestamptz
);
create index invitations_relationship_idx on public.invitations (relationship_id);

-- ============================================================= helpers

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Profile row is created automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), ''), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Is the current user an active member of this relationship?
-- SECURITY DEFINER so it can be used inside RLS policies on
-- relationship_members without recursive policy evaluation.
create or replace function public.is_member(rel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.relationship_members m
    where m.relationship_id = rel
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

-- The current user's active relationship id (or null).
create or replace function public.my_relationship_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.relationship_id from public.relationship_members m
  where m.user_id = auth.uid() and m.status = 'active'
  limit 1;
$$;

-- Do two users currently share an active relationship?
create or replace function public.shares_relationship(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.relationship_members a
    join public.relationship_members b on b.relationship_id = a.relationship_id
    where a.user_id = auth.uid() and a.status = 'active'
      and b.user_id = other    and b.status = 'active'
  );
$$;

-- Defence in depth: no relationship may ever hold more than two active members,
-- regardless of which code path inserts the row.
create or replace function public.enforce_two_members()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  active_count int;
begin
  if new.status <> 'active' then
    return new;
  end if;
  -- Serialise concurrent joins to the same relationship.
  perform 1 from public.relationships r where r.id = new.relationship_id for update;
  select count(*) into active_count
  from public.relationship_members m
  where m.relationship_id = new.relationship_id
    and m.status = 'active'
    and m.id <> new.id;
  if active_count >= 2 then
    raise exception 'This space already has two members.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger relationship_members_two_max
  before insert or update of status on public.relationship_members
  for each row execute function public.enforce_two_members();

-- ======================================================= RPC functions

-- Create a new relationship space with the caller as its first member.
create or replace function public.create_relationship(p_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rel uuid;
  clean_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  if public.my_relationship_id() is not null then
    raise exception 'You are already part of a space.' using errcode = 'P0001';
  end if;
  if clean_name is not null and char_length(clean_name) > 60 then
    raise exception 'Please choose a shorter name.' using errcode = '22001';
  end if;

  insert into public.relationships (name, created_by)
  values (coalesce(clean_name, 'Our Little Ritual'), uid)
  returning id into rel;

  insert into public.relationship_members (relationship_id, user_id, role)
  values (rel, uid, 'creator');

  return rel;
end;
$$;

-- Create (or replace) the invitation link for the caller's space.
-- Returns the RAW token exactly once; only its hash is stored.
-- Any earlier unredeemed invitation is revoked, so only one link works at a time.
create or replace function public.create_invitation()
returns table (token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  rel uuid;
  raw text;
  exp timestamptz := now() + interval '7 days';
  active_count int;
begin
  if uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  rel := public.my_relationship_id();
  if rel is null then
    raise exception 'Create your space first.' using errcode = 'P0001';
  end if;

  perform 1 from public.relationships r where r.id = rel for update;
  select count(*) into active_count from public.relationship_members m
  where m.relationship_id = rel and m.status = 'active';
  if active_count >= 2 then
    raise exception 'Your partner has already joined.' using errcode = 'P0001';
  end if;

  update public.invitations i
     set revoked_at = now()
   where i.relationship_id = rel and i.redeemed_at is null and i.revoked_at is null;

  -- 32 random bytes -> URL-safe base64 (43 chars, 256 bits of entropy)
  raw := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');

  insert into public.invitations (relationship_id, token_hash, created_by, expires_at)
  values (rel, encode(extensions.digest(raw, 'sha256'), 'hex'), uid, exp);

  token := raw;
  expires_at := exp;
  return next;
end;
$$;

-- Revoke any open invitation for the caller's space.
create or replace function public.revoke_invitations()
returns void language plpgsql security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
begin
  if rel is null then
    raise exception 'You are not part of a space.' using errcode = 'P0001';
  end if;
  update public.invitations i
     set revoked_at = now()
   where i.relationship_id = rel and i.redeemed_at is null and i.revoked_at is null;
end;
$$;

-- Let a signed-in invitee see who invited them before they accept.
-- Reveals nothing unless the token is valid, unredeemed and unexpired.
create or replace function public.preview_invitation(p_token text)
returns table (relationship_name text, inviter_name text, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  return query
    select r.name, coalesce(nullif(p.display_name, ''), 'Your partner'), i.expires_at
    from public.invitations i
    join public.relationships r on r.id = i.relationship_id
    left join public.profiles p on p.id = i.created_by
    where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
      and i.redeemed_at is null
      and i.revoked_at is null
      and i.expires_at > now();
end;
$$;

-- Redeem an invitation: the caller joins the relationship as its second member.
create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inv public.invitations%rowtype;
  active_count int;
begin
  if uid is null then
    raise exception 'Please sign in first.' using errcode = '28000';
  end if;
  if p_token is null or char_length(p_token) < 20 or char_length(p_token) > 100 then
    raise exception 'This invitation link is not valid.' using errcode = 'P0001';
  end if;

  select * into inv from public.invitations i
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found or inv.revoked_at is not null then
    raise exception 'This invitation link is not valid.' using errcode = 'P0001';
  end if;
  if inv.redeemed_at is not null then
    raise exception 'This invitation has already been used.' using errcode = 'P0001';
  end if;
  if inv.expires_at <= now() then
    raise exception 'This invitation has expired. Ask your partner for a new link.' using errcode = 'P0001';
  end if;
  if inv.created_by = uid then
    raise exception 'This is your own invitation. Send it to your partner.' using errcode = 'P0001';
  end if;
  if public.my_relationship_id() is not null then
    raise exception 'You are already part of a space.' using errcode = 'P0001';
  end if;

  -- Lock the relationship so two people redeeming at once can't both get in.
  perform 1 from public.relationships r where r.id = inv.relationship_id for update;
  select count(*) into active_count from public.relationship_members m
  where m.relationship_id = inv.relationship_id and m.status = 'active';
  if active_count >= 2 then
    raise exception 'This space already has two members.' using errcode = 'P0001';
  end if;

  insert into public.relationship_members (relationship_id, user_id, role)
  values (inv.relationship_id, uid, 'partner');

  update public.invitations set redeemed_by = uid, redeemed_at = now() where id = inv.id;

  update public.relationships
     set status = 'active', activated_at = coalesce(activated_at, now())
   where id = inv.relationship_id;

  return inv.relationship_id;
end;
$$;

-- Rename the shared space (either member).
create or replace function public.rename_relationship(p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  rel uuid := public.my_relationship_id();
  clean_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if rel is null then
    raise exception 'You are not part of a space.' using errcode = 'P0001';
  end if;
  if clean_name is null or char_length(clean_name) > 60 then
    raise exception 'Please choose a name between 1 and 60 characters.' using errcode = '22001';
  end if;
  update public.relationships set name = clean_name where id = rel;
end;
$$;

-- =========================================================== RLS

alter table public.profiles             enable row level security;
alter table public.relationships        enable row level security;
alter table public.relationship_members enable row level security;
alter table public.invitations          enable row level security;

-- profiles: read yourself and your partner; edit only yourself.
create policy "profiles: read self or partner" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_relationship(id));
create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- relationships: members can read; writes only through functions.
create policy "relationships: members read" on public.relationships
  for select to authenticated using (public.is_member(id));

-- relationship_members: members can read their own space's roster.
create policy "members: members read" on public.relationship_members
  for select to authenticated using (public.is_member(relationship_id));

-- invitations: members can see status (never the raw token — it isn't stored).
create policy "invitations: members read" on public.invitations
  for select to authenticated using (public.is_member(relationship_id));

-- =========================================================== grants
-- Supabase grants broad table privileges to anon/authenticated by default.
-- Tighten them so the only possible writes are the ones we intend.

revoke all on public.profiles, public.relationships,
              public.relationship_members, public.invitations
  from anon, authenticated;

grant select on public.profiles, public.relationships, public.relationship_members
  to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;
-- token_hash is deliberately not readable by clients.
grant select (id, relationship_id, created_by, created_at, expires_at,
              redeemed_by, redeemed_at, revoked_at)
  on public.invitations to authenticated;

-- Functions: callable only by signed-in users (Postgres grants EXECUTE to PUBLIC by default).
revoke execute on function
  public.is_member(uuid), public.my_relationship_id(), public.shares_relationship(uuid),
  public.create_relationship(text), public.create_invitation(), public.revoke_invitations(),
  public.preview_invitation(text), public.accept_invitation(text), public.rename_relationship(text),
  public.handle_new_user(), public.enforce_two_members(), public.touch_updated_at()
  from public, anon;

grant execute on function
  public.is_member(uuid), public.my_relationship_id(), public.shares_relationship(uuid),
  public.create_relationship(text), public.create_invitation(), public.revoke_invitations(),
  public.preview_invitation(text), public.accept_invitation(text), public.rename_relationship(text)
  to authenticated;
