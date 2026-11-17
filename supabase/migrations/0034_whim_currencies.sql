-- =====================================================================
-- Our Little Ritual — Whims: US dollars and euros too (17 Nov 2026)
-- =====================================================================

do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.whims'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%currency%ANY%'
  loop
    execute format('alter table public.whims drop constraint %I', c);
  end loop;
end $$;
alter table public.whims add constraint whims_currency_check
  check (currency is null or currency in ('RM', 'SEK', 'CLP', 'USD', 'EUR'));

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
  if (p_price is null) <> (nullif(p_currency, '') is null) or (p_currency is not null and p_currency <> '' and p_currency not in ('RM', 'SEK', 'CLP', 'USD', 'EUR')) then
    raise exception 'Pick RM, SEK, CLP, USD or EUR for the price.' using errcode = '22023';
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


revoke execute on function public.save_whim(uuid, text, text, text, numeric, text, text, text) from public, anon;
grant execute on function public.save_whim(uuid, text, text, text, numeric, text, text, text) to authenticated;
