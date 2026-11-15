-- =====================================================================
-- Our Little Ritual — "Our photo" on Home (polish, approved by Vee, 15 Nov 2026)
--
-- Either of you can pick one of your trip & moment photos as a cover on Home.
-- Only photos already in your own Scrapbook can be chosen; no new uploads.
-- =====================================================================

alter table public.relationships
  add column cover_photo_id uuid references public.moment_photos (id) on delete set null;

create or replace function public.set_cover_photo(p_photo uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare rel uuid := public.my_relationship_id();
begin
  if rel is null then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
  if p_photo is not null and not exists (select 1 from public.moment_photos p where p.id = p_photo and p.relationship_id = rel) then
    raise exception 'Pick one of your own scrapbook photos.' using errcode = 'P0001';
  end if;
  update public.relationships set cover_photo_id = p_photo where id = rel;
end;
$$;

-- The cover's storage path (or null), for the Home polaroid.
create or replace function public.cover_photo()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'path', p.path, 'taken_at', p.taken_at, 'moment_title', m.title, 'place', m.place)
    from public.relationships r
    join public.moment_photos p on p.id = r.cover_photo_id and p.relationship_id = r.id
    join public.moments m on m.id = p.moment_id
   where r.id = public.my_relationship_id();
$$;

revoke execute on function public.set_cover_photo(uuid), public.cover_photo() from public, anon;
grant execute on function public.set_cover_photo(uuid), public.cover_photo() to authenticated;
