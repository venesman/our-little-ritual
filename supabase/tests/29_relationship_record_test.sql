-- Relationship record: time together, milestone types, photo dates, documents, consent, fairer summary.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;

-- past visits are allowed now; the old function too
select tests.expect(public.save_visit(null, 'Berlin', date '2025-04-10', date '2025-04-17', '') is not null, 'old save_visit accepts a past date');
create temp table v as select public.save_time_together(jsonb_build_object(
  'title', 'His first visit to Malaysia', 'place', 'My family home', 'city', 'Kuching', 'country', 'Malaysia',
  'starts_on', '2025-12-20', 'ends_on', '2026-01-03', 'stay_type', 'visit', 'travel', 'one', 'travelled_by', :'B',
  'with_family', true, 'family_note', 'Christmas with my family')) id;
grant select on v to authenticated;
select tests.expect((select stay_type = 'visit' and travelled_by = :'B'::uuid and with_family and city = 'Kuching' from public.visits where id = (select id from v)), 'new fields saved');
select tests.expect_error($$select public.save_time_together('{"place":"X","starts_on":"2025-01-01","travel":"one"}'::jsonb)$$, 'who travelled');
select tests.expect_error($$select public.save_time_together('{"place":"X","starts_on":"2025-01-01","travel":"one","travelled_by":"00000000-0000-0000-0000-00000000000d"}'::jsonb)$$, 'who travelled');
select tests.expect_error($$select public.save_time_together('{"place":"X","starts_on":"2025-01-01","stay_type":"married"}'::jsonb)$$, 'Unknown kind of stay');
select tests.expect_error($$select public.save_time_together('{"place":"X","starts_on":"1980-01-01"}'::jsonb)$$, 'between 1990');
-- holidays stay holidays unless you say otherwise
create temp table h as select public.save_time_together('{"place":"Munich","starts_on":"2025-08-01","ends_on":"2025-08-09","travel":"both"}'::jsonb) id;
grant select on h to authenticated;
select tests.expect((select stay_type from public.visits where id = (select id from h)) = 'visit', 'default is a visit, never living together');
-- the old app editing a visit keeps the new fields
select public.save_visit((select id from v), 'Family home', date '2025-12-20', date '2026-01-03', 'edited');
select tests.expect((select with_family and city = 'Kuching' and place = 'Family home' from public.visits where id = (select id from v)), 'old editor keeps the new fields');

-- milestone types and precision
create temp table ms as select public.save_milestone_v2('{"title":"We first met","happened_on":"2024-11-01","tag":"first_met","date_precision":"month"}'::jsonb) id;
grant select on ms to authenticated;
select tests.expect((select tag = 'first_met' and date_precision = 'month' from public.milestones where id = (select id from ms)), 'milestone type + precision');
select tests.expect_error($$select public.save_milestone_v2('{"title":"x","tag":"wedding_party"}'::jsonb)$$, 'Unknown milestone type');
select tests.expect((select count(*) from jsonb_array_elements(public.timeline_feed()) e where e->>'tag' = 'first_met' and e->>'precision' = 'month') = 1, 'timeline carries the type');
select tests.expect((select count(*) from jsonb_array_elements(public.timeline_feed()) e where e->>'title' = 'His first visit to Malaysia' and (e->>'with_family')::boolean) = 1, 'timeline shows the visit title');

-- photo dates: from the photo, or corrected by hand
create temp table mo as select public.save_moment(null, 'Christmas', 'Kuching', date '2025-12-24') id;
grant select on mo to authenticated;
select public.add_moment_photo((select id from mo), (select relationship_id from public.moments where id = (select id from mo))::text || '/' || (select id from mo)::text || '/' || :'A' || '/p1.jpg', timestamptz '2025-12-24 10:00+00');
select tests.expect((select s.taken_at_source from public.moment_photo_sources() s join public.moment_photos p using (id) where p.path like '%/p1.jpg') = 'photo', 'camera date labelled as from the photo');
select public.set_photo_date((select s.id from public.moment_photo_sources() s join public.moment_photos p using (id) where p.path like '%/p1.jpg'), date '2025-12-25');
select tests.expect((select s.taken_at_source from public.moment_photo_sources() s join public.moment_photos p using (id) where p.path like '%/p1.jpg') = 'manual', 'hand-corrected date labelled');
select tests.expect_error($$select public.set_photo_date((select s.id from public.moment_photo_sources() s join public.moment_photos p using (id) where p.path like '%/p1.jpg'), date '2099-01-01')$$, 'between 1990');

-- supporting documents
create temp table doc as select public.add_document('visit', (select id from v),
  public.my_relationship_id()::text || '/' || :'A' || '/flight.pdf', 'Flight KCH-BER.pdf', 'travel_booking') id;
grant select on doc to authenticated;
select tests.expect((select count(*) from public.documents_list()) = 1, 'document listed');
select tests.expect_error($$select public.add_document('visit', gen_random_uuid(), 'x/y/z.pdf', 'a')$$, 'couldn''t find');
select tests.expect_error(format($$select public.add_document('visit', %L, %L, 'a')$$, (select id from v), public.my_relationship_id()::text || '/00000000-0000-0000-0000-00000000000b/x.pdf'), 'right place');
select tests.expect_error('select * from public.supporting_documents', 'permission denied');
insert into storage.objects (bucket_id, name, owner) values ('documents', public.my_relationship_id()::text || '/' || :'A' || '/flight.pdf', :'A');
select tests.expect_error(format($$insert into storage.objects (bucket_id, name, owner) values ('documents', %L, %L)$$,
  public.my_relationship_id()::text || '/' || :'B' || '/sneaky.pdf', :'A'), 'row-level security');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select tests.expect((select count(*) from public.documents_list()) = 1, 'partner sees the document');
select tests.expect((select count(*) from storage.objects where bucket_id = 'documents') = 1, 'partner can open the file');
select tests.expect(not public.can_delete_document((select path from public.documents_list() limit 1)), 'attached file can''t be deleted directly');
reset role;
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select tests.expect((select count(*) from public.documents_list()) = 0, 'another couple sees no documents');
select tests.expect((select count(*) from storage.objects where bucket_id = 'documents') = 0, 'another couple can''t open the file');
select tests.expect_error(format($$select public.remove_document(%L)$$, (select id from doc)), 'couldn''t find');
reset role;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select tests.expect(public.remove_document((select id from doc)) like '%/flight.pdf', 'remove returns the path');
select tests.expect(public.can_delete_document(public.my_relationship_id()::text || '/' || :'A' || '/flight.pdf'), 'then the file can be deleted');
-- deleting a visit forgets its documents
select public.add_document('visit', (select id from v), public.my_relationship_id()::text || '/' || :'A' || '/b.pdf', 'b.pdf');
select public.delete_visit((select id from v));
select tests.expect((select count(*) from public.documents_list()) = 0, 'documents go with their visit');

-- your words in exports: off until you say so
select tests.expect((public.export_consent() ->> :'A')::boolean = false, 'words off by default');
select public.set_export_my_words(true);
select tests.expect((public.export_consent() ->> :'A')::boolean and not (public.export_consent() ->> :'B')::boolean, 'each person decides for themselves');

-- fairer summary
select tests.expect((select count(*) >= 1 from public.export_activity_summary_v3(date '2025-01-01', current_date)), 'summary v3 runs');
select tests.expect((select coalesce(sum(call_days), 0) <= (select count(*) from public.play_sessions) from public.export_activity_summary_v3(date '2020-01-01', current_date)), 'call days never exceed sessions');
reset role;

set role anon;
select tests.expect_error('select public.export_consent()', 'permission denied');
select tests.expect_error('select public.documents_list()', 'permission denied');
reset role;
