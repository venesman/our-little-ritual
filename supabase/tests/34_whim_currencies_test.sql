-- Whims accept US dollars and euros.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.save_whim(null, 'little_want', 'Concert tickets', null, 45.50, 'USD', '', null) as w1 \gset
select public.save_whim(null, 'shared_wish', 'Train across Europe', null, 300, 'EUR', '', null) as w2 \gset
select tests.expect_error($$select public.save_whim(null, 'little_want', 'Nope', null, 10, 'GBP', '', null)$$, 'Pick RM, SEK, CLP, USD or EUR');
reset role;
select tests.expect((select currency from public.whims where id = :'w1') = 'USD', 'saves USD');
select tests.expect((select currency from public.whims where id = :'w2') = 'EUR', 'saves EUR');
