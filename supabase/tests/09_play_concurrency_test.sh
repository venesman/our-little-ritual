#!/usr/bin/env bash
# Both open Play at the same moment → one session. Both tap "another one" at the same
# moment → two draws, no errors, no duplicate within the round.
set -uo pipefail
P=(psql -h "$PSQL_HOST" -p "$PSQL_PORT" -U postgres -d postgres -X -q -t -A)
H1='00000000-0000-0000-0000-0000000000a1'; H2='00000000-0000-0000-0000-0000000000a2'   # the "simul" couple
open_play() { "${P[@]}" -c "select set_config('request.jwt.claim.sub','$1',false); set role authenticated; select pg_sleep(0.3); select public.start_play_session();" 2>&1 | tail -1 >"$2"; }
D=$(mktemp -d)
open_play "$H1" "$D/a" & open_play "$H2" "$D/b" & wait
a=$(cat "$D/a"); b=$(cat "$D/b")
draw() { "${P[@]}" -c "select set_config('request.jwt.claim.sub','$1',false); set role authenticated; select pg_sleep(0.3); select public.draw_play_activity('$a','{}') ->> 'session_id';" 2>&1 | tail -1 >"$2"; }
draw "$H1" "$D/c" & draw "$H2" "$D/d" & wait
c=$(cat "$D/c"); d=$(cat "$D/d"); rm -rf "$D"
items=$("${P[@]}" -c "select count(*), count(distinct activity_id) from public.play_session_items where session_id='$a'")
if [ -n "$a" ] && [ "$a" = "$b" ] && [ "$c" = "$a" ] && [ "$d" = "$a" ] && [ "$items" = "2|2" ]; then
  echo "  ok: simultaneous open -> one session; simultaneous draws -> 2 distinct items"
else echo "  FAIL: a=$a b=$b c=$c d=$d items=$items"; exit 1; fi
