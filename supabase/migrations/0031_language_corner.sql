-- =====================================================================
-- Our Little Ritual — Language corner (15 Nov 2026)
--
-- Words and phrases you teach each other (Swedish, Spanish, Iban, Malay,
-- English…). The starter phrasebook and the games live in the app; only
-- the words you add are stored. No scores, no streaks.
-- =====================================================================

create table if not exists public.taught_words (
  id              uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  added_by        uuid not null references auth.users (id) on delete cascade,
  language        text not null check (language in ('sv', 'es', 'iban', 'ms', 'en', 'other')),
  phrase          text not null check (char_length(phrase) between 1 and 120),
  meaning         text not null check (char_length(meaning) between 1 and 200),
  pronunciation   text not null default '' check (char_length(pronunciation) <= 120),
  note            text not null default '' check (char_length(note) <= 200),
  created_at      timestamptz not null default now()
);
create index if not exists taught_words_rel_idx on public.taught_words (relationship_id, created_at desc);
alter table public.taught_words enable row level security;
revoke all on public.taught_words from anon, authenticated;

create or replace function public.teach_word(p_id uuid, p_language text, p_phrase text, p_meaning text, p_pronunciation text default '', p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_rel uuid := public.my_relationship_id();
  v_id  uuid;
  v_phrase text := trim(coalesce(p_phrase, ''));
  v_meaning text := trim(coalesce(p_meaning, ''));
begin
  if auth.uid() is null or v_rel is null then
    raise exception 'You are not part of a space yet.' using errcode = 'P0001';
  end if;
  if p_language not in ('sv', 'es', 'iban', 'ms', 'en', 'other') then
    raise exception 'Please choose a language.' using errcode = '22023';
  end if;
  if char_length(v_phrase) < 1 or char_length(v_phrase) > 120 then
    raise exception 'Add the word or phrase (up to 120 characters).' using errcode = '22023';
  end if;
  if char_length(v_meaning) < 1 or char_length(v_meaning) > 200 then
    raise exception 'Add what it means (up to 200 characters).' using errcode = '22023';
  end if;
  if char_length(coalesce(p_pronunciation, '')) > 120 or char_length(coalesce(p_note, '')) > 200 then
    raise exception 'That''s a bit long — please shorten it.' using errcode = '22001';
  end if;
  if p_id is null then
    if (select count(*) from public.taught_words w where w.relationship_id = v_rel) >= 2000 then
      raise exception 'Your phrasebook is full! Remove a few first.' using errcode = 'P0001';
    end if;
    insert into public.taught_words (relationship_id, added_by, language, phrase, meaning, pronunciation, note)
    values (v_rel, auth.uid(), p_language, v_phrase, v_meaning, trim(coalesce(p_pronunciation, '')), trim(coalesce(p_note, '')))
    returning id into v_id;
  else
    -- only the person who taught it changes it
    update public.taught_words w
       set language = p_language, phrase = v_phrase, meaning = v_meaning,
           pronunciation = trim(coalesce(p_pronunciation, '')), note = trim(coalesce(p_note, ''))
     where w.id = p_id and w.relationship_id = v_rel and w.added_by = auth.uid()
    returning w.id into v_id;
    if v_id is null then
      raise exception 'Only the person who taught this word can change it.' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_taught_word(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.taught_words w where w.id = p_id and w.relationship_id = public.my_relationship_id() and w.added_by = auth.uid();
  if not found then
    raise exception 'Only the person who taught this word can remove it.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.taught_words_list()
returns table (id uuid, added_by uuid, language text, phrase text, meaning text, pronunciation text, note text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.id, w.added_by, w.language, w.phrase, w.meaning, w.pronunciation, w.note, w.created_at
    from public.taught_words w where w.relationship_id = public.my_relationship_id()
   order by w.created_at desc;
$$;

revoke execute on function public.teach_word(uuid, text, text, text, text, text), public.delete_taught_word(uuid), public.taught_words_list() from public, anon;
grant execute on function public.teach_word(uuid, text, text, text, text, text), public.delete_taught_word(uuid), public.taught_words_list() to authenticated;
