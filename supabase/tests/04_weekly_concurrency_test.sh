#!/usr/bin/env bash
# Both partners open the app at the same instant on a brand-new week.
# They must receive the same weekly record, and only one row may exist.
set -uo pipefail
P=(psql -h "$PSQL_HOST" -p "$PSQL_PORT" -U postgres -d postgres -X -q -t -A)
H1='00000000-0000-0000-0000-0000000000a1'; H2='00000000-0000-0000-0000-0000000000a2'
"${P[@]}" -c "insert into auth.users (id,email) values ('$H1','h1@x.test'),('$H2','h2@x.test')" >/dev/null
TOKEN=$("${P[@]}" -c "select set_config('request.jwt.claim.sub','$H1',false); set role authenticated; select public.create_relationship('simul'); select token from public.create_invitation();" | tail -1)
"${P[@]}" -c "select set_config('request.jwt.claim.sub','$H2',false); set role authenticated; select public.accept_invitation('$TOKEN');" >/dev/null
open_app() { "${P[@]}" -c "select set_config('request.jwt.claim.sub','$1',false); set role authenticated; select pg_sleep(0.3); select weekly_id from public.ensure_current_ritual();" 2>&1 | tail -1 >"$2"; }
D=$(mktemp -d)
open_app "$H1" "$D/a" & open_app "$H2" "$D/b" & wait
a=$(cat "$D/a"); b=$(cat "$D/b"); rm -rf "$D"
rows=$("${P[@]}" -c "select count(*) from public.weekly_activities w join public.relationships r on r.id=w.relationship_id where r.name='simul'")
if [ -n "$a" ] && [ "$a" = "$b" ] && [ "$rows" = "1" ]; then echo "  ok: simultaneous first open -> same ritual, 1 row"; else echo "  FAIL: a=$a b=$b rows=$rows"; exit 1; fi
