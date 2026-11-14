-- Phase 1 security tests. Each block acts as a specific user by setting the
-- JWT "sub" claim and switching to the `authenticated` (or `anon`) role,
-- exactly as PostgREST does for requests from the app.
\set ON_ERROR_STOP 1

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

create or replace function tests.expect_error(stmt text, pattern text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pattern || '%' then
      raise notice 'ok: % -> %', left(stmt, 60), sqlerrm;
      return;
    end if;
    raise exception 'FAIL: % raised "%" but expected "%"', stmt, sqlerrm, pattern;
  end;
  raise exception 'FAIL: % succeeded but should have failed (%).', stmt, pattern;
end;
$$;

create or replace function tests.expect(cond boolean, label text)
returns void language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FAIL: %', label;
  end if;
  raise notice 'ok: %', label;
end;
$$;
grant execute on all functions in schema tests to anon, authenticated;

-- Seed users (as the auth service would).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.test', '{"display_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.test',   '{"display_name":"Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.test', '{"display_name":"Carol"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.test',  '{"display_name":"Dave"}');

select tests.expect((select count(*) from public.profiles) = 4, 'profile auto-created for every sign-up');
select tests.expect((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Alice',
                    'display name copied from sign-up metadata');

-- ---------------------------------------------------------------- anon
set role anon;
select tests.expect_error('select * from public.relationships', 'permission denied');
select tests.expect_error('select * from public.profiles', 'permission denied');
select tests.expect_error('select public.create_relationship(''x'')', 'permission denied');
select tests.expect_error('select public.accept_invitation(''aaaaaaaaaaaaaaaaaaaaaaaaa'')', 'permission denied');
reset role;

-- ------------------------------------------------- alice creates a space
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select public.create_relationship('Kuching ↔ Santiago') as rel_id \gset
select tests.expect((select status from public.relationships) = 'pending', 'new space starts pending');
select tests.expect_error('select public.create_relationship(''another'')', 'already part of a space');
select tests.expect_error('select public.accept_invitation(''zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'')', 'not valid');

select token as alice_token from public.create_invitation() \gset
select tests.expect(char_length(:'alice_token') = 43, 'token is 43 url-safe chars (256 bits)');
select tests.expect(:'alice_token' ~ '^[A-Za-z0-9_-]+$', 'token is url-safe');
select tests.expect_error('select token_hash from public.invitations', 'permission denied');
select tests.expect((select count(*) from public.invitations where revoked_at is null) = 1, 'creator sees one open invitation');
select tests.expect_error(format('select public.accept_invitation(%L)', :'alice_token'), 'your own invitation');

-- Direct writes are impossible even for a member.
select tests.expect_error('update public.relationships set status = ''active''', 'permission denied');
select tests.expect_error(format('insert into public.relationship_members (relationship_id, user_id, role) values (%L, %L, ''partner'')',
       :'rel_id', '00000000-0000-0000-0000-00000000000c'), 'permission denied');
select tests.expect_error('insert into public.invitations (relationship_id, token_hash, created_by, expires_at) values (gen_random_uuid(), ''x'', auth.uid(), now())', 'permission denied');
reset role;

-- The stored value is a hash, never the raw token.
select tests.expect((select token_hash from public.invitations limit 1) = encode(extensions.digest(:'alice_token', 'sha256'), 'hex'),
                    'only the SHA-256 hash is stored');
select tests.expect(not exists (select 1 from public.invitations where token_hash = :'alice_token'), 'raw token is not stored');

-- --------------------------------------- carol (outsider) sees nothing
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
set role authenticated;
select tests.expect((select count(*) from public.relationships) = 0, 'outsider cannot see the space');
select tests.expect((select count(*) from public.relationship_members) = 0, 'outsider cannot see members');
select tests.expect((select count(*) from public.invitations) = 0, 'outsider cannot see invitations');
select tests.expect((select count(*) from public.profiles) = 1, 'outsider sees only their own profile');
select tests.expect(not public.is_member(:'rel_id'), 'is_member false for outsider');
reset role;

-- ------------------------------------------- bob previews and accepts
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
set role authenticated;
select tests.expect((select inviter_name from public.preview_invitation(:'alice_token')) = 'Alice', 'invitee sees who invited them');
select tests.expect((select count(*) from public.preview_invitation('wrong-token-wrong-token-wrong')) = 0, 'bad token previews nothing');
select tests.expect(public.accept_invitation(:'alice_token') = :'rel_id'::uuid, 'partner joins the right space');
select tests.expect((select status from public.relationships) = 'active', 'space becomes active once both are connected');
select tests.expect((select count(*) from public.relationship_members) = 2, 'partner sees both members');
select tests.expect((select count(*) from public.profiles) = 2, 'partner sees own + partner profile');
select tests.expect((select count(*) from public.preview_invitation(:'alice_token')) = 0, 'used invitation no longer previews');

-- Bob may edit only his own profile.
update public.profiles set display_name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set display_name = 'Bobby', timezone = 'America/Santiago' where id = '00000000-0000-0000-0000-00000000000b';
select tests.expect_error('update public.profiles set id = gen_random_uuid() where id = auth.uid()', 'permission denied');
reset role;
select tests.expect((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Alice', 'cannot edit partner profile');
select tests.expect((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'Bobby', 'can edit own profile');

-- ------------------------------- carol tries the used link: refused
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
set role authenticated;
select tests.expect_error(format('select public.accept_invitation(%L)', :'alice_token'), 'already been used');
select tests.expect((select count(*) from public.relationships) = 0, 'third person still cannot see the space');
reset role;

-- Alice cannot issue another invitation now the space is full.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
select tests.expect_error('select * from public.create_invitation()', 'already joined');
select public.rename_relationship('Our corner');
select tests.expect((select name from public.relationships) = 'Our corner', 'members can rename the space');
reset role;

-- Even a privileged code path cannot add a third active member.
select tests.expect_error(format('insert into public.relationship_members (relationship_id, user_id, role) values (%L, %L, ''partner'')',
       :'rel_id', '00000000-0000-0000-0000-00000000000c'), 'already has two members');

-- -------------------------------- expiry and revocation (dave's space)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
set role authenticated;
select public.create_relationship(null) as dave_rel \gset
select token as dave_old from public.create_invitation() \gset
select token as dave_new from public.create_invitation() \gset
select tests.expect((select count(*) from public.relationships) = 1, 'dave sees only his own space');
select tests.expect((select count(*) from public.profiles) = 1, 'dave cannot see alice or bob');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
set role authenticated;
select tests.expect_error(format('select public.accept_invitation(%L)', :'dave_old'), 'not valid');  -- revoked by the newer link
reset role;
update public.invitations set expires_at = now() - interval '1 minute' where relationship_id = :'dave_rel' and revoked_at is null;
set role authenticated;
select tests.expect_error(format('select public.accept_invitation(%L)', :'dave_new'), 'expired');
-- Bob is already in a space, so he cannot join a second one.
reset role;
update public.invitations set expires_at = now() + interval '1 day' where relationship_id = :'dave_rel' and revoked_at is null;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
set role authenticated;
select tests.expect_error(format('select public.accept_invitation(%L)', :'dave_new'), 'already part of a space');
reset role;

-- Revoke works.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
set role authenticated;
select public.revoke_invitations();
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
set role authenticated;
select tests.expect_error(format('select public.accept_invitation(%L)', :'dave_new'), 'not valid');
reset role;

\echo 'foundation tests: all passed'
