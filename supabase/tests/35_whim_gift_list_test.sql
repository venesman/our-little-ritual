-- Save a Little Want for a special day.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.save_whim(null, 'little_want', 'Silver earrings', null, 120, 'RM', 'So pretty', null) as w \gset
select tests.expect_error(format('select public.save_whim_for(%L, ''birthday'')', :'w'), 'for your partner to answer');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect_error(format('select public.save_whim_for(%L, ''graduation'')', :'w'), 'Pick a special day');
select public.save_whim_for(:'w', 'birthday', 'For March!');
select tests.expect((select j->>'status' = 'saved_for' and j->>'occasion' = 'birthday' and (j->>'surprise')::boolean from jsonb_array_elements(public.my_whims()) j where j->>'id' = :'w'), 'on his gift list, for her birthday');
select public.save_whim_for(:'w', 'anniversary');
select tests.expect((select j->>'occasion' = 'anniversary' from jsonb_array_elements(public.my_whims()) j where j->>'id' = :'w'), 'can change the occasion');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect((select j->>'status' = 'set_aside' and j->'occasion' = 'null'::jsonb and j->>'response_note' = '' from jsonb_array_elements(public.my_whims()) j where j->>'id' = :'w'), 'she only sees "saved for a special day", not which');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.set_whim_status(:'w', 'bought');
select tests.expect((select j->>'status' = 'bought' from jsonb_array_elements(public.my_whims()) j where j->>'id' = :'w'), 'bought, still secret');
select public.reveal_whim(:'w');
select tests.expect_error(format('select public.save_whim_for(%L, ''birthday'')', :'w'), 'already bought');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect((select j->>'status' = 'bought' from jsonb_array_elements(public.my_whims()) j where j->>'id' = :'w'), 'revealed on the day');
reset role;
