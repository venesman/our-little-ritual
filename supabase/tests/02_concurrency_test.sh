#!/usr/bin/env bash
# Two different people redeem the same invitation at the same instant.
# Exactly one must succeed; the space must end with exactly two members.
set -uo pipefail
P=(psql -h "$PSQL_HOST" -p "$PSQL_PORT" -U postgres -d postgres -X -q -t -A)
E='00000000-0000-0000-0000-0000000000e1'; F='00000000-0000-0000-0000-0000000000f1'; G='00000000-0000-0000-0000-0000000000f2'
"${P[@]}" -c "insert into auth.users (id,email) values ('$E','e@x.test'),('$F','f@x.test'),('$G','g@x.test')" >/dev/null
TOKEN=$("${P[@]}" -c "select set_config('request.jwt.claim.sub','$E',false); set role authenticated; select public.create_relationship('race'); select token from public.create_invitation();" | tail -1)
redeem() { "${P[@]}" -c "select set_config('request.jwt.claim.sub','$1',false); set role authenticated; select pg_sleep(0.3); select public.accept_invitation('$TOKEN');" >"$2" 2>&1; echo $? >>"$2"; }
D=$(mktemp -d)
redeem "$F" "$D/f" & redeem "$G" "$D/g" & wait
ok=$(grep -l '^0$' "$D"/f "$D"/g | wc -l)
members=$("${P[@]}" -c "select count(*) from public.relationship_members m join public.relationships r on r.id=m.relationship_id where r.name='race' and m.status='active'")
rm -rf "$D"
if [ "$ok" = "1" ] && [ "$members" = "2" ]; then echo "  ok: simultaneous redemption -> one winner, 2 members"; else echo "  FAIL: winners=$ok members=$members"; exit 1; fi
