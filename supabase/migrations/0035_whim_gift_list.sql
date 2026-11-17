-- =====================================================================
-- Our Little Ritual — Whims: "Save it for a special day" (17 Nov 2026)
--
-- When one of you adds a Little Want, the other can now save it for an
-- occasion (a birthday, your anniversary, Christmas, Valentine's or "one
-- day"). It goes on their own gift list, grouped by occasion.
--
-- It works like a surprise: the person who asked only sees "Saved for a
-- special day ✦" — never which occasion — until it's bought and revealed.
-- =====================================================================

alter table public.whims add column if not exists occasion text
  check (occasion is null or occasion in ('birthday', 'anniversary', 'christmas', 'valentines', 'someday'));

-- allow the new 'saved_for' answer
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.whims'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%little_want%'
  loop
    execute format('alter table public.whims drop constraint %I', c);
  end loop;
  for c in select conname from pg_constraint
            where conrelid = 'public.whims'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%ANY%' and pg_get_constraintdef(oid) not like '%kind%'
  loop
    execute format('alter table public.whims drop constraint %I', c);
  end loop;
end $$;
alter table public.whims add constraint whims_status_check
  check (status in ('new', 'maybe', 'yes', 'surprise', 'saved_for', 'bought', 'not_now', 'plan', 'saving', 'done'));
alter table public.whims add constraint whims_kind_status_check
  check (kind = 'little_want' and status in ('new', 'maybe', 'yes', 'surprise', 'saved_for', 'bought', 'not_now')
      or kind = 'shared_wish' and status in ('plan', 'saving', 'done', 'maybe', 'not_now'));

-- Save your partner's Little Want for an occasion (or change which one).
create or replace function public.save_whim_for(p_id uuid, p_occasion text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  w   public.whims%rowtype;
  nt  text := case when p_note is null then null else trim(p_note) end;
begin
  select * into w from public.whims where id = p_id and relationship_id = public.my_relationship_id() for update;
  if not found or w.kind <> 'little_want' then
    raise exception 'We couldn''t find that whim.' using errcode = 'P0001';
  end if;
  if w.created_by = uid then
    raise exception 'This one''s for your partner to answer.' using errcode = 'P0001';
  end if;
  if p_occasion is null or p_occasion not in ('birthday', 'anniversary', 'christmas', 'valentines', 'someday') then
    raise exception 'Pick a special day.' using errcode = '22023';
  end if;
  if w.status = 'bought' then
    raise exception 'This one''s already bought!' using errcode = 'P0001';
  end if;
  if nt is not null and char_length(nt) > 300 then
    raise exception 'Please keep the note under 300 characters.' using errcode = '22001';
  end if;
  update public.whims
     set status = 'saved_for', occasion = p_occasion, surprise = true, archived = false,
         status_by = uid, status_at = now(), response_note = coalesce(nt, response_note)
   where id = w.id;
end;
$$;

-- The asker sees a surprise only as "in the works" (or "saved for a special day"), never the occasion.
create or replace function public.my_whims()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', w.id, 'kind', w.kind, 'created_by', w.created_by, 'name', w.name, 'link', w.link,
           'price', w.price, 'currency', w.currency, 'message', w.message, 'photo_path', w.photo_path,
           'status',        case when hidden then (case when w.status = 'saved_for' then 'set_aside' else 'in_the_works' end) else w.status end,
           'status_by',     case when hidden then null else w.status_by end,
           'status_at',     case when hidden then w.created_at else w.status_at end,
           'response_note', case when hidden then '' else w.response_note end,
           'occasion',      case when hidden then null else w.occasion end,
           'surprise',      w.surprise and not hidden,
           'revealed_at',   w.revealed_at, 'archived', w.archived, 'created_at', w.created_at)
         order by w.created_at desc), '[]'::jsonb)
    from (select x.*, (x.surprise and x.created_by = auth.uid()) as hidden
            from public.whims x where x.relationship_id = public.my_relationship_id()) w;
$$;

revoke execute on function public.save_whim_for(uuid, text, text), public.my_whims() from public, anon;
grant execute on function public.save_whim_for(uuid, text, text), public.my_whims() to authenticated;
