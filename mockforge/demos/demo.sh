#!/usr/bin/env bash
# MockForge demo: spec in, a behaving mock backend out, then the interesting parts.
#
#   ./demos/demo.sh                      # uses samples/tasks.yaml
#   ./demos/demo.sh samples/orders.json  # works with any spec
#   PORT=4000 ./demos/demo.sh samples/blog.yaml
#
# Everything is printed with the real command and the real response, so the
# transcript can be read (or pasted) as evidence.
set -euo pipefail

cd "$(dirname "$0")/.."

SPEC="${1:-samples/tasks.yaml}"
PORT="${PORT:-3300}"
BASE="http://127.0.0.1:${PORT}"
PID=""

cleanup() { [ -n "$PID" ] && kill "$PID" 2>/dev/null || true; }
trap cleanup EXIT

hr() { printf '\n\033[1;36m=== %s ===\033[0m\n' "$1"; }
cmd() { printf '\n\033[1;33m$ %s\033[0m\n' "$1"; }
note() { printf '\033[2m%s\033[0m\n' "$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

hr "1. Boot the mock from a spec"
note "A single command: spec in, HTTP server out. Watch the boot time."
cmd "node packages/cli/dist/index.js ${SPEC} --port ${PORT} --seed 42 --latency 25"
node packages/cli/dist/index.js "$SPEC" --port "$PORT" --host 127.0.0.1 --seed 42 --latency 25 &
PID=$!
for _ in $(seq 1 50); do curl -sf "${BASE}/__health" >/dev/null 2>&1 && break; sleep 0.1; done

hr "2. Health"
cmd "curl ${BASE}/__health"
curl -s "${BASE}/__health" | jq .

hr "3. Routes inferred from the spec"
cmd "curl ${BASE}/__admin/routes"
curl -s "${BASE}/__admin/routes" | jq -r '.[] | "\(.method) \(.path)  [\(.kind)]"'

# --- work out which paths to drive, from the spec itself -------------------
ROUTES=$(curl -s "${BASE}/__admin/routes")
# Prefer a resource that supports the whole CRUD flow, then one that at least
# has a readable item, then any collection.
COLLECTION=$(echo "$ROUTES" | jq -r '
  ( [.[] | select(.kind == "create")] | map(.path) ) as $create
  | ( [.[] | select(.kind == "read")]   | map(.path) ) as $read
  | [.[] | select(.kind == "list")]
  | ( map(select(.path as $p | ($read | any(. == $p + "/{*}")))) ) as $readable
  | ( map(select(.path as $p | ($create | any(. == $p)))) ) as $creatable
  | ( [ $readable[] | select(. as $p | ($creatable | any(. == $p))) ] ) as $both
  | ( ($both | first) // ($creatable | first) // ($readable | first) // first ).path // empty')
ITEM_TEMPLATE=$(echo "$ROUTES" | jq -r --arg c "$COLLECTION" \
  '[.[] | select(.kind == "read" and (.path | startswith($c + "/")))] | first.path // empty')
[ -n "$COLLECTION" ] || { echo "This spec has no list route to drive; booting it was still the demo."; exit 0; }

hr "4. Semantic data: values that mean something"
note "No 'lorem ipsum' where the field has a meaning: Indian mobiles, ISO-8601"
note "timestamps inside a two-year window, enums, two-decimal money, and every"
note "required field present."
cmd "curl '${BASE}${COLLECTION}?limit=3' -H 'x-session-id: demo'"
curl -s "${BASE}${COLLECTION}?limit=3" -H 'x-session-id: demo' | jq -c '.[]'

hr "5. Create, read, update, delete (stateful, per session)"
cmd "curl -X POST ${BASE}${COLLECTION} -d '{}'"
CREATED=$(curl -s -X POST "${BASE}${COLLECTION}" -H 'content-type: application/json' -H 'x-session-id: demo' -d '{}')
echo "$CREATED" | jq . 2>/dev/null || echo "$CREATED"

if echo "$CREATED" | jq -e '.id' >/dev/null 2>&1; then
  ID=$(echo "$CREATED" | jq -r '.id')
else
  # This spec wants more than an empty body: that is the 400 doing its job.
  # Fall back to a record the mock seeded for us.
  note "(this spec requires more fields than an empty body - the 400 above is the"
  note " validation working. Driving a seeded record instead.)"
  ID=$(curl -s "${BASE}${COLLECTION}?limit=1" -H 'x-session-id: demo' | jq -r '.[0].id')
fi

if [ -n "$ITEM_TEMPLATE" ]; then
  ITEM="${ITEM_TEMPLATE/\{*\}*/$ID}"
  cmd "curl ${BASE}${ITEM}"
  curl -s "${BASE}${ITEM}" -H 'x-session-id: demo' | jq .

  cmd "curl -X PATCH ${BASE}${ITEM} -H 'content-type: application/json' -d '{}'"
  PATCHED=$(curl -s -X PATCH "${BASE}${ITEM}" -H 'content-type: application/json' -H 'x-session-id: demo' -d '{}')
  echo "$PATCHED" | jq . 2>/dev/null || echo "$PATCHED"

  cmd "curl -X DELETE ${BASE}${ITEM}   # 204 No Content"
  printf 'HTTP %s\n' "$(code -X DELETE "${BASE}${ITEM}" -H 'x-session-id: demo')"

  cmd "curl ${BASE}${ITEM}   # gone -> 404"
  curl -s -w '\nHTTP %{http_code}\n' "${BASE}${ITEM}" -H 'x-session-id: demo'
fi

hr "6. A body that breaks the spec is a 400 that says where"
cmd "curl -X POST ${BASE}${COLLECTION} -H 'content-type: application/json' -d '{\"__proto__\":{}}'"
curl -s -X POST "${BASE}${COLLECTION}" -H 'content-type: application/json' -H 'x-session-id: demo' \
  -d '{"__proto__":{}}' | jq .

hr "7. Session isolation: the same URL, different data"
cmd "curl '${BASE}${COLLECTION}?limit=1' -H 'x-session-id: alice'"
curl -s "${BASE}${COLLECTION}?limit=1" -H 'x-session-id: alice' | jq -c '.[0].id'
cmd "curl '${BASE}${COLLECTION}?limit=1' -H 'x-session-id: bob'"
curl -s "${BASE}${COLLECTION}?limit=1" -H 'x-session-id: bob' | jq -c '.[0].id'
note "Two sessions, two independent stores: alice creates, bob is unaffected."
curl -s -o /dev/null -X POST "${BASE}${COLLECTION}" -H 'content-type: application/json' -H 'x-session-id: alice' -d '{}'
cmd "curl ${BASE}/__admin/sessions"
curl -s "${BASE}/__admin/sessions" | jq -c '.[] | {id, records}'

hr "8. Chaos, on demand"
cmd "curl -H 'X-Mock-Status: 418' ${BASE}${COLLECTION}"
curl -s -w '\nHTTP %{http_code}\n' -H 'X-Mock-Status: 418' -H 'x-session-id: demo' "${BASE}${COLLECTION}"
cmd "curl -w 'took %{time_total}s' -H 'X-Mock-Latency: 800' ${BASE}${COLLECTION}"
curl -s -o /dev/null -w 'took %{time_total}s\n' -H 'X-Mock-Latency: 800' -H 'x-session-id: demo' "${BASE}${COLLECTION}"
cmd "curl -X PUT ${BASE}/__admin/chaos -d '{\"errorRate\":1,\"split404\":100}'"
curl -s -X PUT "${BASE}/__admin/chaos" -H 'content-type: application/json' -H 'x-session-id: demo' \
  -d '{"errorRate":1,"split404":100}' | jq .
cmd "curl ${BASE}${COLLECTION}   # every call is now a 404"
curl -s -w '\nHTTP %{http_code}\n' -H 'x-session-id: demo' "${BASE}${COLLECTION}"
cmd "curl -X PUT ${BASE}/__admin/chaos -d '{\"errorRate\":0,\"split404\":50}'"
curl -s -o /dev/null -X PUT "${BASE}/__admin/chaos" -H 'content-type: application/json' -H 'x-session-id: demo' \
  -d '{"errorRate":0,"split404":50}'

hr "9. The live request log (SSE)"
note "Open http://127.0.0.1:${PORT}/__ui in a browser to watch this stream in the"
note "dashboard. Two seconds of it, captured here:"
timeout 2 curl -s -N "${BASE}/__admin/logs" | head -4 || true

hr "10. The dashboard"
printf 'Dashboard: %s/__ui\n' "$BASE"
note "Routes, sessions, chaos sliders and the SSE log stream - same origin, no build."

hr "Done"
note "Try it yourself:  npm install && npm run build && ./demos/demo.sh"
