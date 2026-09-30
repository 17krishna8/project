#!/usr/bin/env bash
# MockForge demo 2: hot reload. Edit the spec, the mock changes with it.
#
#   ./demos/spec-swap.sh
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-3301}"
BASE="http://127.0.0.1:${PORT}"
WORK="$(mktemp -d)"
SPEC="${WORK}/api.yaml"
PID=""

cleanup() { [ -n "$PID" ] && kill "$PID" 2>/dev/null || true; rm -rf "$WORK"; }
trap cleanup EXIT

hr() { printf '\n\033[1;36m=== %s ===\033[0m\n' "$1"; }
cmd() { printf '\n\033[1;33m$ %s\033[0m\n' "$1"; }
note() { printf '\033[2m%s\033[0m\n' "$1"; }

cat > "$SPEC" <<'YAML'
openapi: 3.0.3
info:
  title: Widgets API
  version: 1.0.0
paths:
  /widgets:
    get:
      operationId: listWidgets
      responses:
        '200':
          description: Widgets
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Widget'
  /widgets/{widgetId}:
    parameters:
      - name: widgetId
        in: path
        required: true
        schema:
          type: string
    get:
      operationId: getWidget
      responses:
        '200':
          description: Widget
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Widget'
components:
  schemas:
    Widget:
      type: object
      required: [id, sku, price]
      properties:
        id:
          type: string
          pattern: '^wdg_[A-Za-z0-9]{6,12}$'
        sku:
          type: string
          pattern: '^SKU-[0-9]{6}$'
        price:
          type: number
          minimum: 1
          maximum: 9999
          multipleOf: 0.01
YAML

hr "1. Boot with --watch"
cmd "node packages/cli/dist/index.js ${SPEC} --port ${PORT} --watch"
node packages/cli/dist/index.js "$SPEC" --port "$PORT" --host 127.0.0.1 --watch &
PID=$!
for _ in $(seq 1 50); do curl -sf "${BASE}/__health" >/dev/null 2>&1 && break; sleep 0.1; done

cmd "curl ${BASE}/__admin/routes"
curl -s "${BASE}/__admin/routes" | jq -r '.[] | "\(.method) \(.path)"'

hr "2. Swap the spec file for a different API"
note "The same file, rewritten on disk: Widgets becomes Gadgets."
sed 's/Widgets API/Gadgets API/; s/version: 1.0.0/version: 2.0.0/; s/Widget/Gadget/g; s/widget/gadget/g; s/wdg/gdg/g' "$SPEC" > "${SPEC}.new"
mv "${SPEC}.new" "$SPEC"

note "Waiting for the file watcher to pick the change up..."
for _ in $(seq 1 60); do
  TITLE=$(curl -s "${BASE}/__health" >/dev/null && curl -s "${BASE}/__admin/routes" | jq -r '.[0].path')
  [ "$TITLE" = "/gadgets" ] && break
  sleep 0.25
done

cmd "curl ${BASE}/__admin/routes"
curl -s "${BASE}/__admin/routes" | jq -r '.[] | "\(.method) \(.path)"'
cmd "curl '${BASE}/gadgets?limit=2'"
curl -s "${BASE}/gadgets?limit=2" -H 'x-session-id: swap' | jq -c '.[]'
cmd "curl ${BASE}/widgets   # the old shape is gone"
curl -s -w '\nHTTP %{http_code}\n' "${BASE}/widgets"

hr "Done"
note "No restart, no lost sessions: only the spec changed."
