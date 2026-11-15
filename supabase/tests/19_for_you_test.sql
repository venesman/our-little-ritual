-- "For you": counts what's waiting for each person; never content; nothing for outsiders.
\set ON_ERROR_STOP 1
\set H1 '00000000-0000-0000-0000-00000000f201'
\set H2 '00000000-0000-0000-0000-00000000f202'

insert into auth.users (id, email) values (:'H1', 'h1@x'), (:'H2', 'h2@x');
insert into public.relationships (name, status, created_by, created_at) values ('For you test', 'active', :'H1', now() - interval '30 days') returning id as hrel \gset
insert into public.relationship_members (relationship_id, user_id, role) values (:'hrel', :'H1', 'creator'), (:'hrel', :'H2', 'partner');

select set_config('request.jwt.claim.sub', :'H2', false);
set role authenticated;
select tests.expect((public.for_you() ->> 'ritual_open')::boolean and not (public.for_you() ->> 'ritual_partner_shared')::boolean, 'fresh week: open, nothing shared yet');
reset role;

-- H1 shares this week's ritual and check-in, sends a letter, and starts a mission.
select set_config('request.jwt.claim.sub', :'H1', false);
set role authenticated;
select weekly_id as wk from public.ensure_current_ritual() \gset
reset role;
update public.weekly_activities set activity_id = (select id from public.activities where code = 1) where id = :'wk';
select set_config('request.jwt.claim.sub', :'H1', false);
set role authenticated;
select public.save_ritual_draft(:'wk', 'Mine');
select public.submit_ritual(:'wk');
select public.save_checkin(public.ritual_week_start(now()), 'Good', '', '', '', '{}', false, true);
select public.save_letter(null, 'note', '', 'Hi') as l \gset
select public.send_letter(:'l');
select public.start_apart_mission('{}', (select id from public.play_activities where code = 131)) as m \gset
select public.add_apart_entry(:'m', 'my photo hunt');
select tests.expect(not (public.for_you() ->> 'ritual_open')::boolean, 'sharer: ritual no longer open for them');
select tests.expect(not (public.for_you() ->> 'ritual_partner_shared')::boolean, 'sharer: nothing waiting from their partner');
select tests.expect((public.for_you() ->> 'apart_my_turn')::int = 0, 'sharer: not their turn');
reset role;

select set_config('request.jwt.claim.sub', :'H2', false);
set role authenticated;
select tests.expect((public.for_you() ->> 'ritual_partner_shared')::boolean, 'partner: their ritual is waiting for you');
select tests.expect((public.for_you() ->> 'checkin_partner_shared')::boolean, 'partner: their check-in is waiting for you');
select tests.expect((public.for_you() ->> 'letters_unread')::int = 1, 'partner: one letter to open');
select tests.expect((public.for_you() ->> 'apart_my_turn')::int = 1, 'partner: your turn in one mission');
select tests.expect(public.for_you()::text not like '%Mine%' and public.for_you()::text not like '%Hi%' and public.for_you()::text not like '%photo hunt%',
                    'never includes anything anyone wrote');
select public.open_letter(:'l');
select public.save_ritual_draft(:'wk', 'Yours');
select public.submit_ritual(:'wk');
select tests.expect((public.for_you() ->> 'letters_unread')::int = 0 and not (public.for_you() ->> 'ritual_partner_shared')::boolean, 'cleared once you''ve done them');
reset role;

-- Someone with no space gets nothing.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
set role authenticated;
select tests.expect(public.for_you() = '{}'::jsonb, 'no space → nothing');
reset role;
set role anon;
select tests.expect_error('select public.for_you()', 'permission denied');
reset role;
