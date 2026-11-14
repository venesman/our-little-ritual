#!/usr/bin/env bash
# Both partners press "Share" at the same instant. Both must succeed and
# exactly one of them must report the reveal (or both, never neither).
set -uo pipefail
P=(psql -h "$PSQL_HOST" -p "$PSQL_PORT" -U postgres -d postgres -X -q -t -A)
H1='00000000-0000-0000-0000-0000000000a1'; H2='00000000-0000-0000-0000-0000000000a2'   # the "simul" couple from test 04
WK=$("${P[@]}" -c "select w.id from public.weekly_activities w join public.relationships r on r.id=w.relationship_id join public.activities a on a.id=w.activity_id where r.name='simul' and a.response_type not in ('photo','drawing') limit 1")
if [ -z "$WK" ]; then  # this week happened to be a photo/drawing one: give it a text answer path via a fresh week
  WK=$("${P[@]}" -c "select w.id from public.weekly_activities w join public.relationships r on r.id=w.relationship_id where r.name='simul' limit 1")
  IMG=1
fi
REL=$("${P[@]}" -c "select relationship_id from public.weekly_activities where id='$WK'")
for U in $H1 $H2; do
  PATHV="null"
  if [ "${IMG:-0}" = "1" ]; then
    "${P[@]}" -c "select set_config('request.jwt.claim.sub','$U',false); set role authenticated; insert into storage.objects (bucket_id,name) values ('ritual-media','$REL/$WK/$U/a.jpg');" >/dev/null
    PATHV="'$REL/$WK/$U/a.jpg'"
  fi
  "${P[@]}" -c "select set_config('request.jwt.claim.sub','$U',false); set role authenticated; select public.save_ritual_draft('$WK','hello from $U', null, '[]'::jsonb, $PATHV);" >/dev/null
done
share() { "${P[@]}" -c "select set_config('request.jwt.claim.sub','$1',false); set role authenticated; select pg_sleep(0.3); select public.submit_ritual('$WK');" 2>&1 | tail -1 >"$2"; }
D=$(mktemp -d)
share "$H1" "$D/a" & share "$H2" "$D/b" & wait
a=$(cat "$D/a"); b=$(cat "$D/b"); rm -rf "$D"
n=$("${P[@]}" -c "select count(*) from public.activity_submissions where weekly_activity_id='$WK' and status='submitted'")
if [ "$n" = "2" ] && { [ "$a" = "t" ] || [ "$b" = "t" ]; }; then echo "  ok: simultaneous sharing -> both sealed, reveal reported (a=$a b=$b)"; else echo "  FAIL: a=$a b=$b submitted=$n"; exit 1; fi
