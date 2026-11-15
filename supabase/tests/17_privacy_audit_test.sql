-- Privacy audit: rules that must stay true for every table, function and bucket,
-- including ones added in future phases.
\set ON_ERROR_STOP 1

select tests.expect(not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
                    'every table has row-level security on');
select tests.expect(not exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'),
                    'signed-out visitors have no access to any table');
select tests.expect(not exists (select 1 from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public'
                                 and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
                    'no direct writes to any table — every change goes through a checked function');
select tests.expect(not exists (select 1 from information_schema.column_privileges where grantee = 'authenticated' and table_schema = 'public'
                                 and privilege_type in ('INSERT', 'UPDATE')
                                 and not (table_name = 'profiles' and column_name in ('display_name', 'timezone', 'free_from', 'free_to'))),
                    'the only direct edits allowed are your own name, time zone and free hours');
select tests.expect(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
                    'signed-out visitors can''t run any function');
select tests.expect(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                 where n.nspname = 'public' and p.prosecdef
                                   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
                    'every privileged function pins its search path');
select tests.expect(not exists (select 1 from storage.buckets where public), 'every storage bucket is private');
select tests.expect(not exists (select 1 from pg_policies where schemaname = 'public' and qual = 'true'
                                 and tablename not in ('activities', 'play_activities', 'curious_topics', 'checkin_prompts')),
                    'only the shared activity libraries are readable by any signed-in account');

-- A stranger who somehow made an account sees nothing private anywhere.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000ff', 'stranger@x');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false);
set role authenticated;
do $$
declare t text; n bigint;
begin
  foreach t in array array['relationships', 'relationship_members', 'invitations', 'weekly_activities', 'activity_submissions', 'visits', 'nudges',
                           'play_sessions', 'play_session_items', 'play_favourites', 'life_updates', 'relationship_profile', 'milestones',
                           'apart_missions', 'apart_entries', 'curious_sessions', 'curious_notes', 'curious_discoveries', 'curious_favourites',
                           'checkins', 'letters', 'scrapbook_entries', 'moments', 'moment_photos'] loop
    execute format('select count(*) from public.%I', t) into n;
    perform tests.expect(n = 0, 'stranger sees nothing in ' || t);
  end loop;
  select count(*) into n from public.profiles where id <> auth.uid();
  perform tests.expect(n = 0, 'stranger sees no one else''s profile');
  select count(*) into n from storage.objects;
  perform tests.expect(n = 0, 'stranger sees no files');
  perform tests.expect(public.scrapbook_feed() = '[]'::jsonb, 'stranger''s scrapbook is empty');
end
$$;
reset role;
