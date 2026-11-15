-- =====================================================================
-- Our Little Ritual — Yearly keepsake (15 Nov 2026)
--
-- "Our year together": one read-only summary per calendar year, built
-- from what's already in the app, plus a short note from each of you
-- about the year. Your partner's note stays sealed until you've written
-- yours. No reminders, no streaks.
-- =====================================================================

create table if not exists public.keepsake_notes (
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  year            int  not null check (year between 1990 and 2200),
  user_id         uuid not null references auth.users (id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 1500),
  updated_at      timestamptz not null default now(),
  primary key (relationship_id, year, user_id)
);
alter table public.keepsake_notes enable row level security;
revoke all on public.keepsake_notes from anon, authenticated;

create or replace function public.keepsake_write_note(p_year int, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_rel  uuid := public.my_relationship_id();
  v_body text := trim(coalesce(p_body, ''));
begin
  if auth.uid() is null or v_rel is null then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
  if p_year is null or p_year < 1990 or p_year > extract(year from current_date)::int then
    raise exception 'You can write about this year or an earlier one.' using errcode = '22023';
  end if;
  if char_length(v_body) < 1 then
    raise exception 'Write a few words first.' using errcode = '22023';
  end if;
  if char_length(v_body) > 1500 then
    raise exception 'Please keep it under 1,500 characters.' using errcode = '22001';
  end if;
  insert into public.keepsake_notes (relationship_id, year, user_id, body)
  values (v_rel, p_year, auth.uid(), v_body)
  on conflict (relationship_id, year, user_id) do update set body = excluded.body, updated_at = now();
end;
$$;

-- Everything for one year, in one go.
create or replace function public.keepsake(p_year int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_rel   uuid := public.my_relationship_id();
  v_from  date := make_date(p_year, 1, 1);
  v_to    date := least(make_date(p_year, 12, 31), current_date);
  v_mine  text;
  v_his   text;
  v_his_id uuid;
  v_stats jsonb;
  v_days  int;
begin
  if auth.uid() is null or v_rel is null then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
  if p_year < 1990 or p_year > extract(year from current_date)::int then
    raise exception 'That year hasn''t happened yet.' using errcode = '22023';
  end if;

  select m.user_id into v_his_id from public.relationship_members m
   where m.relationship_id = v_rel and m.user_id <> auth.uid() and m.status = 'active' limit 1;
  select n.body into v_mine from public.keepsake_notes n where n.relationship_id = v_rel and n.year = p_year and n.user_id = auth.uid();
  select n.body into v_his  from public.keepsake_notes n where n.relationship_id = v_rel and n.year = p_year and n.user_id = v_his_id;

  select jsonb_build_object(
      'rituals', coalesce(sum(s.rituals_both), 0), 'checkins', coalesce(sum(s.checkins_both), 0),
      'letters', coalesce(sum((select coalesce(sum(value::int), 0) from jsonb_each_text(s.letters_by))), 0),
      'call_days', coalesce(sum(s.call_days), 0), 'games', coalesce(sum(s.games), 0), 'creations', coalesce(sum(s.creations), 0),
      'research', coalesce(sum(s.research), 0), 'missions', coalesce(sum(s.missions_both), 0), 'songs', coalesce(sum(s.songs), 0))
    into v_stats
    from public.export_activity_summary_v3(v_from, v_to) s;

  -- every day together, counted once (visits + trips, past days only)
  select count(distinct d)::int into v_days from (
    select generate_series(greatest(v.starts_on, v_from), least(coalesce(v.ends_on, v.starts_on), v_to), interval '1 day')::date d
      from public.visits v where v.relationship_id = v_rel and v.starts_on <= v_to and coalesce(v.ends_on, v.starts_on) >= v_from
    union all
    select generate_series(greatest(x.starts_on, v_from), least(coalesce(x.ends_on, x.starts_on), v_to), interval '1 day')::date
      from public.moments x where x.relationship_id = v_rel and x.starts_on <= v_to and coalesce(x.ends_on, x.starts_on) >= v_from
  ) q;

  return jsonb_build_object(
    'year', p_year,
    'stats', v_stats,
    'days_together', v_days,
    'visits', coalesce((select jsonb_agg(jsonb_build_object(
        'title', coalesce(nullif(v.title, ''), 'Together in ' || v.place), 'place', v.place, 'city', v.city, 'country', v.country,
        'from', v.starts_on, 'until', v.ends_on, 'stay_type', v.stay_type, 'with_family', v.with_family) order by v.starts_on)
      from public.visits v where v.relationship_id = v_rel and v.starts_on between v_from and v_to), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(distinct v.country) from public.visits v
      where v.relationship_id = v_rel and v.starts_on between v_from and v_to and v.country <> ''), '[]'::jsonb),
    'milestones', coalesce((select jsonb_agg(jsonb_build_object('title', m.title, 'on', m.happened_on, 'tag', m.tag, 'precision', m.date_precision) order by m.happened_on)
      from public.milestones m where m.relationship_id = v_rel and m.happened_on between v_from and v_to), '[]'::jsonb),
    'firsts', coalesce((select jsonb_agg(e order by e->>'on') from jsonb_array_elements(public.timeline_feed()) e
      where e->>'kind' in ('first', 'began') and (e->>'on')::date between v_from and v_to), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('path', p.path, 'taken_at', p.taken_at, 'title', p.title)) from (
        select ph.path, ph.taken_at, x.title from public.moment_photos ph join public.moments x on x.id = ph.moment_id
         where ph.relationship_id = v_rel and coalesce(ph.taken_at::date, x.starts_on) between v_from and v_to
         order by coalesce(ph.taken_at::date, x.starts_on), ph.position limit 12) p), '[]'::jsonb),
    'songs', coalesce((select jsonb_agg(jsonb_build_object('title', t.title, 'artist', t.artist, 'url', t.song_url, 'on', t.shared_on, 'by', t.added_by) order by t.shared_on)
      from (select * from public.soundtrack_entries t where t.relationship_id = v_rel and t.shared_on between v_from and v_to order by t.shared_on limit 12) t), '[]'::jsonb),
    'note_mine', v_mine,
    'note_partner', case when v_mine is not null then v_his end,
    'partner_wrote', v_his is not null
  );
end;
$$;

-- Years worth showing: from when you met (or your first memory) up to this year.
create or replace function public.keepsake_years()
returns int[] language sql stable security definer set search_path = '' as $$
  with rel as (select public.my_relationship_id() id),
  starts as (
    select min(d) d from (
      select (select coalesce(r.activated_at, r.created_at)::date from public.relationships r where r.id = (select id from rel)) d
      union all select min(m.happened_on) from public.milestones m where m.relationship_id = (select id from rel) and m.happened_on <= current_date
      union all select min(v.starts_on) from public.visits v where v.relationship_id = (select id from rel)
      union all select min(x.starts_on) from public.moments x where x.relationship_id = (select id from rel)
    ) a
  )
  select coalesce(array_agg(y order by y desc), array[]::int[])
    from generate_series(extract(year from (select d from starts))::int, extract(year from current_date)::int) y
   where (select id from rel) is not null and (select d from starts) is not null;
$$;

revoke execute on function public.keepsake_write_note(int, text), public.keepsake(int), public.keepsake_years() from public, anon;
grant execute on function public.keepsake_write_note(int, text), public.keepsake(int), public.keepsake_years() to authenticated;
