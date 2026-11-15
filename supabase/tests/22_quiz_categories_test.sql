-- Quiz Time: extra categories and the US-only filter.
\set ON_ERROR_STOP 1
select tests.expect((select count(*) from public.quiz_categories where code in ('anime', 'games', 'board_games', 'mythology', 'celebrities')) = 5, 'five new categories');
select tests.expect(public.opentdb_category('Entertainment: Japanese Anime & Manga') = 'anime' and public.opentdb_category('Entertainment: Video Games') = 'games'
                    and public.opentdb_category('Entertainment: Musicals & Theatres') = 'celebrities' and public.opentdb_category('Entertainment: Comics') is null, 'mapping');
select tests.expect(public.opentdb_us_only('Which NFL team won the 1990 Super Bowl?'), 'US sport skipped');
select tests.expect(public.opentdb_us_only('Who was the 16th President of the United States?'), 'US politics skipped');
select tests.expect(public.opentdb_us_only('What is the capital of Texas? Austin'), 'US states skipped');
select tests.expect(public.opentdb_us_only('Which U.S. city hosts Mardi Gras?'), 'U.S. skipped');
select tests.expect(public.opentdb_us_only('Which American singer released Thriller?'), '"American" skipped');
select tests.expect(not public.opentdb_us_only('What is the largest country in South America? Brazil'), 'South America kept');
select tests.expect(not public.opentdb_us_only('Which Latin American country has Spanish as its language?'), 'Latin American kept');
select tests.expect(not public.opentdb_us_only('What is the capital of Georgia (the country)? Tbilisi'), 'world questions kept');
select tests.expect(not public.opentdb_us_only('In Naruto, what village is Naruto from?'), 'anime kept');
