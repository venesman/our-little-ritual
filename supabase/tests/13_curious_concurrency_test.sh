#!/usr/bin/env bash
# Both open The Curious Club at the same moment → one session. Both tap
# "Start researching" at the same moment → it moves exactly one step.
set -uo pipefail
P=(psql -h "$PSQL_HOST" -p "$PSQL_PORT" -U postgres -d postgres -X -q -t -A)
H1='00000000-0000-0000-0000-0000000000a1'; H2='00000000-0000-0000-0000-0000000000a2'   # the "simul" couple
D=$(mktemp -d)
open_cc() { "${P[@]}" -c "select set_config('request.jwt.claim.sub','$1',false); set role authenticated; select pg_sleep(0.3); select public.start_curious() ->> 'session_id';" 2>&1 | tail -1 >"$2"; }
open_cc "$H1" "$D/a" & open_cc "$H2" "$D/b" & wait
a=$(cat "$D/a"); b=$(cat "$D/b")
adv() { "${P[@]}" -c "select set_config('request.jwt.claim.sub','$1',false); set role authenticated; select pg_sleep(0.3); select public.curious_advance('$a','setup') ->> 'stage';" 2>&1 | tail -1 >"$2"; }
adv "$H1" "$D/c" & adv "$H2" "$D/d" & wait
c=$(cat "$D/c"); d=$(cat "$D/d"); rm -rf "$D"
n=$("${P[@]}" -c "select count(*) from public.curious_sessions s join public.relationship_members m on m.relationship_id = s.relationship_id where m.user_id='$H1'")
if [ -n "$a" ] && [ "$a" = "$b" ] && [ "$c" = "research" ] && [ "$d" = "research" ] && [ "$n" = "1" ]; then
  echo "  ok: simultaneous open -> one session; simultaneous 'start researching' -> one step"
else echo "  FAIL: a=$a b=$b c=$c d=$d sessions=$n"; exit 1; fi
