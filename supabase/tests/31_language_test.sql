-- Language corner: teach words, only the teacher edits, privacy.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
create temp table w as select public.teach_word(null, 'iban', 'Aku sayau ka nuan', 'I love you', 'AH-ku SAH-yow kah NOO-an') id;
grant select on w to authenticated;
select tests.expect((select count(*) from public.taught_words_list()) = 1, 'word taught');
select tests.expect_error($$select public.teach_word(null, 'klingon', 'x', 'y')$$, 'choose a language');
select tests.expect_error($$select public.teach_word(null, 'sv', ' ', 'y')$$, 'word or phrase');
select tests.expect_error('select * from public.taught_words', 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.taught_words_list()) = 1, 'partner sees it');
select tests.expect_error(format($$select public.teach_word(%L, 'iban', 'x', 'y')$$, (select id from w)), 'Only the person');
select tests.expect_error(format($$select public.delete_taught_word(%L)$$, (select id from w)), 'Only the person');
select public.teach_word(null, 'sv', 'Jag älskar dig', 'I love you');
reset role;

select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect((select count(*) from public.taught_words_list()) = 0, 'another couple sees nothing');
reset role;

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select public.teach_word((select id from w), 'iban', 'Aku sayau ka nuan', 'I love you (to a partner)');
select tests.expect((select meaning from public.taught_words_list() where id = (select id from w)) = 'I love you (to a partner)', 'teacher can edit');
select public.delete_taught_word((select id from w));
select tests.expect((select count(*) from public.taught_words_list()) = 1, 'teacher can remove');
reset role;
set role anon;
select tests.expect_error('select public.taught_words_list()', 'permission denied');
reset role;
