#!/bin/sh
# API smoke test against a running Stratum container.
# Usage: scripts/smoke-test.sh [base-url]   (default http://localhost:8099)
set -e
BASE=${1:-http://localhost:8099}
EMAIL="smoke-$(date +%s)@stratum.test"
PASS="smoke-test-password"
j() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const o=JSON.parse(d);console.log($1)})"; }

curl -sf -X POST "$BASE/api/collections/users/records" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"passwordConfirm\":\"$PASS\"}" >/dev/null
TOKEN=$(curl -sf -X POST "$BASE/api/collections/users/auth-with-password" -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$EMAIL\",\"password\":\"$PASS\"}" | j 'o.token')
USER=$(curl -sf "$BASE/api/collections/users/auth-refresh" -X POST -H "Authorization: $TOKEN" | j 'o.record.id')
H="Authorization: $TOKEN"
echo "user ok"

MATS=$(curl -sf "$BASE/api/collections/materials/records?sort=sort" -H "$H")
echo "$MATS" | j '"materials: "+o.items.map(m=>m.name).join(", ")'
MAT=$(echo "$MATS" | j 'o.items[0].id')

PRN=$(curl -sf -X POST "$BASE/api/collections/printers/records" -H "$H" -H 'Content-Type: application/json' \
  -d "{\"owner\":\"$USER\",\"name\":\"Test printer\",\"technology\":\"fdm\",\"bed_x\":256,\"bed_y\":256,\"bed_z\":256,\"nozzle\":0.4,\"layer_min\":0.08,\"layer_max\":0.28}" | j 'o.id')
echo "printer ok"

curl -sf -X POST "$BASE/api/collections/calibrations/records" -H "$H" -H 'Content-Type: application/json' \
  -d "{\"owner\":\"$USER\",\"printer\":\"$PRN\",\"material\":\"$MAT\",\"press\":0.05,\"snug\":0.15,\"slide\":0.25,\"loose\":0.4,\"results\":{\"press\":1}}" >/dev/null
echo "calibration ok"

PRJ=$(curl -sf -X POST "$BASE/api/collections/projects/records" -H "$H" -H 'Content-Type: application/json' \
  -d "{\"owner\":\"$USER\",\"name\":\"Smoke part\",\"printer\":\"$PRN\",\"material\":\"$MAT\",\"model\":{\"version\":1,\"units\":\"mm\",\"nodes\":[]}}" | j 'o.id')
curl -sf -X PATCH "$BASE/api/collections/projects/records/$PRJ" -H "$H" -H 'Content-Type: application/json' -d '{"name":"Renamed"}' >/dev/null
echo "project ok"

# Another user must not see this project.
E2="other-$(date +%s)@stratum.test"
curl -sf -X POST "$BASE/api/collections/users/records" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$E2\",\"password\":\"$PASS\",\"passwordConfirm\":\"$PASS\"}" >/dev/null
T2=$(curl -sf -X POST "$BASE/api/collections/users/auth-with-password" -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$E2\",\"password\":\"$PASS\"}" | j 'o.token')
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/collections/projects/records/$PRJ" -H "Authorization: $T2")
[ "$CODE" = "404" ] && echo "isolation ok" || { echo "isolation FAILED ($CODE)"; exit 1; }
# Nor create records owned by someone else.
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/collections/projects/records" -H "Authorization: $T2" -H 'Content-Type: application/json' -d "{\"owner\":\"$USER\",\"name\":\"x\"}")
[ "$CODE" = "400" ] || [ "$CODE" = "403" ] && echo "owner spoof blocked ok" || { echo "owner spoof FAILED ($CODE)"; exit 1; }
echo "all good"
