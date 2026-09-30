# PROGRESS.md - the repository is the only memory

Current phase: see `PHASE_CURRENT`.

| Phase | Name | Builder specialty | Suites | Status |
|---|---|---|---|---|
| 0 | Harness | orchestrator | - | DONE |
| 1 | Test contract | qa-auditor | - | DONE (red: no CLI yet) |
| 2 | Walking skeleton | spec engineer | a01-a03 | DONE |
| 3 | Semantic data | data engineer | a04 | DONE |
| 4 | State and sessions | state engineer | a05-a07 | DONE |
| 5 | Chaos and validation | state engineer | a08-a09 | DONE |
| 6 | Admin and reload | spec engineer | a10 | DONE |
| 7 | Dashboard and CLI | UI engineer | a11 | DONE |
| 8 | Hardening | qa-auditor | a12 | DONE |
| 9 | Release | orchestrator | all | DONE |

## Phase 0 - Harness

- npm workspaces (`packages/core`, `packages/cli`, `apps/dashboard`), TypeScript
  strict, ESLint flat config, Vitest (unit + black-box acceptance projects).
- `docs/CONTRACT.md` fixed; `scripts/run-acceptance.mjs` honours `--upto N`
  (default `PHASE_CURRENT`); integrity lock + checks in `scripts/integrity/`.
- Four workflows: `ci`, `acceptance`, `integrity`, `review-gate`.
- Checks: lint, typecheck, unit tests with coverage (80% threshold on core), build.

## Phase 1 - Test contract

Written from B1/B2 only, before any implementation exists:

- **Fixtures**: `users.yaml` (id/name/email/phone/status enum/balance min 0/age 18-65/postalCode pattern/createdAt), `petstore.yaml`, Swagger 2.0 twins of both, `circular.yaml` (self-referencing Node), `malformed.yaml` (invalid YAML), `remote-ref.yaml`, `gen-200-endpoints.mjs` (50 resources x 4 ops = 200 endpoints).
- **Suites**: a01-a12, 70 black-box tests. Each spawns the `mockforge` CLI on a free port and speaks HTTP.
- `acceptance/phases.json` maps suite -> phase; `npm run acceptance -- --upto N` runs suites up to N (default `PHASE_CURRENT`).
- `acceptance/.lock` is the SHA-256 of the whole contract (integrity gate).

### Phase 1 receipts (2026-09-30)

```
$ npm run typecheck:acceptance   -> clean (core+cli+dashboard+acceptance)
$ npm run lint                   -> 0 problems
$ npm run acceptance -- --upto 2
  Test Files  3 failed (3)
       Tests  7 failed | 6 skipped (13)
  every failure: "mockforge did not become healthy ... (exitCode=1)"
                 + "mockforge: Phase 0 scaffold - the server arrives in Phase 2"
$ npm run integrity              -> INTEGRITY: OK
```

Red for exactly the right reason: the CLI is still the Phase 0 scaffold stub, so no
server exists to talk to. No test was skipped, weakened or edited to pass.

| Suite | Tests | Requirement proved |
|---|---|---|
| a01 boot and routes | 6 | B1.6 fast boot; B2 reserved paths, documented statuses, error shape, 405+Allow |
| a02 swagger2 parity | 3 | B1 "OpenAPI 3.0 or Swagger 2.0"; identical behaviour of the twins |
| a03 spec robustness | 4 | B2 security: circular refs, malformed spec, remote $ref, 5 MB limit |
| a04 semantic data | 9 | B1.1 + B2 data rules: Indian mobiles, emails, 2-decimal money, enums, required, min/max, pattern, ISO timestamps, --seed, 1,000+ objects |
| a05 CRUD | 10 | B1.2 + B2: 201/404/204, X-Total-Count, filters, pagination, sort, client ids |
| a06 session isolation | 4 | B1.4: two sessions, cookie fallback, concurrent sessions, reset |
| a07 limits | 3 | B2 limits: TTL expiry, LRU eviction, max records (409) |
| a08 chaos | 7 | B1.3 + B2: latency +/-50 ms, clamp at 3000, error rate +/-5% over 1,000 calls, split, header overrides, fault bodies, reserved paths unaffected |
| a09 validation | 7 | B2: 400 with {path, reason}, 415, 413, independent Ajv response validation, dev/prod mode |
| a10 admin and reload | 6 | B2: all /__admin routes, SSE log fields, hot reload, --watch, invalid reload guard |
| a11 UI and CLI | 6 | B1.6/B2 DX: /__ui HTML + assets, help, version, exit codes, startup summary |
| a12 hardening | 5 | B2 security + scalability: 200-endpoint boot <5 s, 100 concurrent sessions, session sanitization, prototype pollution, bounded memory |

## Phase 2 - Walking skeleton (spec engineer)

Built in `packages/core`:

- `spec/loader.ts` - reads JSON/YAML, rejects >5 MB, non-local `$ref`s, missing
  `openapi`/`swagger` keys; YAML errors report line and column; full validation
  through `@apidevtools/swagger-parser`.
- `spec/routes.ts` - route and resource inference for OpenAPI 3.x **and**
  Swagger 2.0 (body parameters, response schemas, declared success statuses,
  id-field detection with `$ref` resolution).
- `spec/refs.ts` - local `$ref` resolution, `allOf` merging (shared by the
  router and the generator).
- `generator/` - structural generation: types, enums, const, min/max,
  minLength/maxLength, `pattern` (safe regex-subset engine with a work budget),
  formats, arrays with min/max items, deterministic seeded PRNG.
- `state/store.ts` - per-session in-memory records, deterministic seeding
  (5-10 records per session+resource), session-id sanitisation.
- `server/app.ts` - Fastify app: reserved paths (`/__health`, `/__admin/routes`,
  `/__ui`), one dynamic catch-all that routes against the current table (so hot
  reload can swap it later), JSON error envelope, 404/405 + `Allow`, 413/415
  guards, `X-Total-Count`, `X-Mockforge-Mode`, `mf_session` cookie.
- `packages/cli` - full flag parsing, startup summary, non-zero exit naming the
  spec problem, graceful shutdown.

### Phase 2 receipts (2026-09-30, node v22.22.3)

```
$ npm run lint                        -> 0 problems (exit 0)
$ npm run typecheck                   -> core, cli, dashboard, acceptance (exit 0)
$ npm run test:coverage
  Test Files  8 passed (8)      Tests  133 passed (133)
  All files | 93.3 stmts | 85.37 branches | 97.05 funcs   (threshold 80)
$ npm run build                       -> tsc (core, cli) + vite (dashboard)
$ npm run acceptance -- --upto 2
  Test Files  3 passed (3)       Tests  13 passed (13)
$ npm run integrity                   -> INTEGRITY: OK
```

Live smoke (`mockforge acceptance/fixtures/users.yaml --port 3124`):

```
  MockForge v0.1.0
  Spec:       Users API v1.2.0
  Routes:     6  (1 resource)
  Boot:       284 ms
  Server:     http://127.0.0.1:3124
  Dashboard:  http://127.0.0.1:3124/__ui

GET /users            -> 200, 9 seeded records, x-total-count: 9
GET /__admin/routes   -> GET/POST /users, GET/PUT/PATCH/DELETE /users/{id}
                       with kinds list/create/read/update/remove
DELETE /users         -> 405, allow: GET, POST
GET /nope             -> 404 {"error":{"code":"MOCKFORGE_NOT_FOUND",...}}
```

Bugs found and fixed while building (all caught by the tests written in Phase 1
or by the new unit tests): resource schema resolved to `null` so nothing was
seeded; id-field detection read an unresolved `$ref`; `uuidLike` produced 16 hex
digits instead of 32; wall-clock timestamps broke `--seed` determinism; Fastify's
built-in text/plain parser meant 415 needed an explicit JSON content-type check;
`acceptance/.lock` hashed run logs and went stale on every run.

## Phase 3 - Semantic data (data engineer)

Data is chosen by what the field MEANS, in `generator/semantic.ts`:

- phone/mobile/contactNumber -> Indian mobile `+91[6-9]\d{9}`
- email/e-mail -> deliverable-looking address (faker en_IN)
- postalCode/pincode/zip -> `[1-9]\d{5}`
- price/amount/total/balance/... -> positive INR money, exactly two decimals
- createdAt/updatedAt/timestamp -> ISO-8601 inside the last two years
- name/firstName/lastName, city/state/country, company, jobTitle, address,
  latitude/longitude, uuid, color, ipAddress, website/avatar, description,
  title, age, quantity, status/priority/role/gender/category

Rules are keyed on the property name and are ordered most-specific-first
(`ipAddress` must beat `address`). Every value is checked against the schema's
hard constraints before it is accepted: if a rule's value would break `pattern`,
`minimum`, `format` or `enum`, the rule steps aside and structural generation -
which respects those constraints exactly - takes over. Enums and consts are
therefore never overridden by a meaning rule.

Determinism: faker is seeded once per record from `seed + session + resource +
path`, so `--seed 42` reproduces the same dataset. Timestamps are anchored to
the start of the current UTC day, which keeps them inside the two-year window
forever (a hardcoded epoch expired and a04.7 caught it) while still being
identical across two runs started seconds apart.

### Phase 3 receipts (2026-09-30)

```
$ npm run test:coverage
  Test Files  9 passed (9)      Tests  179 passed (179)
  All files | 93.88 stmts | 87.14 branches | 95.37 funcs
  semantic.ts | 98.43 stmts | 95.79 branches | 92.5 funcs
$ npm run acceptance -- --upto 3
  Test Files  4 passed (4)      Tests  22 passed (22)
```

Live output (`GET /users` against users.yaml):

```
[{"id":"usr_XCjHWiRJ","name":"Harinarayan Abbott","email":"Swapnil_Prajapat@hotmail.com",
  "phone":"+916573071617","status":"active","balance":74411.76,"age":29,
  "postalCode":"766014","createdAt":"2026-01-09T10:04:47.525Z"},
 {"id":"usr_54xkq8","name":"Anshula Iyer","email":"Eshana.Jha23@hotmail.com",
  "phone":"+917330514849","status":"blocked","balance":47125.07,"age":37,
  "postalCode":"680392","createdAt":"2026-03-10T06:41:20.237Z"}]
```

## Phase 4 - Stateful CRUD + sessions (backend engineer)

- CRUD: POST 201 (generated fields merged under the client's body, id kept when
  supplied), GET/PUT/PATCH, DELETE 204, unknown id 404.
- Listing: `X-Total-Count` on the filtered set, equality filters on any other
  query parameter, `sort`+`order`, `limit`/`offset`, 1-based `page`. No default
  page size - a bare GET returns the whole collection (a04.9 reads 1,000).
- Sessions: `X-Session-Id` first, `mf_session` cookie fallback, per-session
  record maps, TTL and LRU caps, per-session record cap (409).
- Admin: `GET/DELETE /__admin/sessions`, `GET /__admin/sessions/:id/data`,
  `GET/PUT /__admin/chaos`.

Two contract decisions changed shape while building this phase and were
updated in `docs/CONTRACT.md`: list paging is opt-in rather than defaulting to
20, and the record cap counts client-created records only (otherwise a fresh
session - already holding its 5-10 seed records - could not accept one create).

The zero-TTL case needed care: a session must survive the request right after
the one that created it but be gone 300 ms later, so expiry is driven by the
background sweeper (cadence = TTL clamped to 250 ms..30 s) and the lazy
on-access check is disabled for TTLs that short.

### Phase 4 receipts (2026-09-30)

```
$ npm run lint / typecheck / build          -> exit 0
$ npm run test:coverage
  Test Files  9 passed (9)      Tests  195 passed (195)
  All files | 93.94 stmts | 86.72 branches | 94.26 funcs
$ npm run acceptance -- --upto 4
  Test Files  7 passed (7)      Tests  39 passed (39)
$ npm run integrity                   -> INTEGRITY: OK
```

## Phase 5 - Chaos + validation (reliability engineer)

- Chaos: `--latency` (clamped to 3000 ms), `--error-rate`, `--error-split a:b`,
  per-request `X-Mock-Latency` / `X-Mock-Error` / `X-Mock-Status`, and live
  editing through `PUT /__admin/chaos`. Fault bodies use the documented
  `{"error":{"code","message","details":[]}}` envelope with
  `MOCKFORGE_INJECTED_<status>`. Reserved paths are ordinary Fastify routes
  registered ahead of the catch-all, so they can never be faulted or delayed.
  Fault decisions come from one deterministic stream seeded from `--seed`.
- Validation: request bodies are checked with Ajv against the route's schema
  (`400` + `[{path, reason}]`, `required` errors point at the missing property);
  dev mode additionally validates every generated response and answers
  `500 MOCKFORGE_SCHEMA_MISMATCH` when the mock would emit something the spec
  forbids. `ajv-formats` is not a dependency (the mirror only carries a version
  needing ajv 6): the formats the specs use are registered by hand, the same ones
  the acceptance suite registers in its own independent Ajv instance.

Two real bugs surfaced while making the responses provably valid:

- recursive schemas hit the generator's depth limit and emitted `null` where the
  spec demanded an object, so `fixtures/circular.yaml` served 500s. The limit now
  produces a schema-valid leaf (required properties only, empty arrays) and
  arrays shrink with depth, which keeps the tree bounded (49 nodes for that
  fixture);
- a client-supplied id is stored verbatim even when it cannot match the schema's
  id pattern, so response validation now ignores property names the client has
  supplied in that session.

### Phase 5 receipts (2026-09-30)

```
$ npm run lint / typecheck / build          -> exit 0
$ npm run test:coverage
  Test Files  9 passed (9)      Tests  206 passed (206)
  All files | 92.95 stmts | 85.71 branches | 95.45 funcs
$ npm run acceptance -- --upto 5
  Test Files  9 passed (9)      Tests  53 passed (53)
$ npm run integrity                   -> INTEGRITY: OK
```

## Phase 6 - Admin and reload (spec engineer)

- `GET /__admin/routes`, `GET/DELETE /__admin/sessions`,
  `GET /__admin/sessions/:id/data` (records keyed by resource at the top level),
  `GET/PUT /__admin/chaos`.
- `GET /__admin/logs`: Server-Sent Events over `reply.hijack()`, a 200-event
  ring buffer replayed to late subscribers, `onResponse` hook recording
  `{time, session, method, path, status, latencyMs, fault, validation}` and
  skipping `/__` paths.
- `POST /__admin/spec` re-reads the spec and swaps the route table in place;
  sessions, chaos settings and the listening socket survive. An invalid file is
  `400 MOCKFORGE_SPEC_INVALID` and the old routes keep serving.
- `--watch` performs the same reload from a debounced `fs.watch`.
- Two loader fixes were needed: duplicate mapping keys resolve last-wins
  (`yaml.load(text, {json: true})`) and path items that declare no operations
  are dropped, because js-yaml hands the losing key back as `null` and
  swagger-parser rejects that as a path item.

### Phase 6 receipts (2026-09-30)

```
$ npm run lint / typecheck / build                -> exit 0
$ npm run test:coverage
  Test Files  9 passed (9)      Tests  210 passed (210)
  All files | 94.58 stmts | 85.07 branches | 97.79 funcs
$ npm run acceptance -- --upto 6
  Test Files  10 passed (10)    Tests  59 passed (59)
$ npm run integrity                               -> INTEGRITY: OK
$ curl -X POST /__admin/spec                      -> 200 {title, version, routes, reloaded}
$ curl -X DELETE /__admin/sessions/nope           -> 404 MOCKFORGE_SESSION_NOT_FOUND
```

## Phase 7 - Dashboard and CLI (UI engineer)

- React + Vite + Tailwind dashboard in `apps/dashboard`, served by the mock
  itself at `/__ui` on the same origin (contract decision 10) - no proxy, no
  second dev server, no CORS. `vite.config.ts` sets `base: "/__ui/"` so the
  bundle drops straight into `apps/dashboard/dist`.
- Components: `StatCard`, `RoutesTable`, `ChaosPanel`, `SessionsPanel`,
  `LogStream`. `src/api.ts` talks to the admin surface with relative URLs and
  `EventSource("/__admin/logs")`.
- `packages/core/src/server/dashboard-page.ts` renders a self-contained fallback
  page with the same features, so `/__ui` is never a dead end when the built
  bundle is absent. The static handler injects the spec title/version/mode and
  guards against path traversal outside the dashboard directory.
- CLI: hand-rolled arg parser, `--watch`, `BOOLEAN_FLAGS` checked before
  `VALUE_FLAGS`, `--help` and `--version` both exit 0.
- Root `build` script builds `@mockforge/core` first: the CLI workspace is named
  `mockforge`, not `@mockforge/cli`, so a clean tree failed with
  `Cannot find module '@mockforge/core'`.

### Phase 7 receipts (2026-09-30)

```
$ npm run lint / typecheck / build                -> exit 0
$ npm run test:coverage
  Test Files  9 passed (9)      Tests  210 passed (210)
  All files | 93.66 stmts | 84.78 branches | 96.37 funcs
$ npm run acceptance -- --upto 7
  Test Files  11 passed (11)    Tests  65 passed (65)
$ npm run integrity                               -> INTEGRITY: OK
$ npx vite build (apps/dashboard)                 -> js 154.58 kB, css 11.57 kB
```

## Phase 8 - Hardening (qa-auditor)

Found and fixed by exercising the product the way a user would, not by reading
the code:

- **`multipleOf` was wrong.** Ajv's built-in check divides and demands an
  integer quotient, so a correct two-decimal price (`1234.56`) came back as
  "must be multiple of 0.01" because `1234.56 / 0.01 === 123455.99999999999`.
  `server/validate.ts` now replaces that keyword with one that shifts both
  operands by the same power of ten and compares them as integers - what JSON
  Schema actually means. `1234.56` passes, `1234.567` does not, `0.0075` passes
  `multipleOf: 0.0001` while `0.00751` does not. Found by
  `samples/orders.json`, whose `unitPrice` declares `multipleOf: 0.01`; before
  the fix the mock answered `500 MOCKFORGE_SCHEMA_MISMATCH` on `GET /orders`.
- **`X-Mock-Error: 1` did nothing.** The header only accepted a status code, so
  the obvious spelling of "please fail this request" was silently ignored. It
  now picks 404 or 500 using the configured split, and still accepts a status
  code for symmetry with `X-Mock-Status`.
- **A Fastify code leaked into the error envelope.** A malformed JSON body - or
  one carrying `__proto__`, which Fastify's secure parser rejects with the same
  code - answered `FST_ERR_CTP_INVALID_JSON_BODY`. Mapped to
  `400 MOCKFORGE_INVALID_JSON_BODY` so every error uses the documented codes.
- **An XSS hole in the dashboard injection.** `spec.title` was interpolated
  straight into the served HTML. Now escaped, with `<` escaped in the injected
  JSON block too.
- **`PHASE_CURRENT` was still `0`**, so a bare `npm run acceptance` ran nothing
  ("No acceptance suites for --upto 0"). Set to `7`, which is where the work
  actually is.
- `samples/` gained three ready-to-run specs (tasks, blog, orders - the last a
  Swagger 2.0 JSON document) and `demos/` gained two transcript-producing demos.
- Documented decision: paths are served exactly as the spec writes them; a
  Swagger 2.0 `basePath` or OpenAPI 3 `servers:` prefix is not prepended
  (`docs/CONTRACT.md` decision 14).

### Phase 8 receipts (2026-09-30)

```
$ npm run lint / typecheck / build                -> exit 0
$ npm run test:coverage
  Test Files  10 passed (10)    Tests  218 passed (218)
  All files | 93.07 stmts | 84.8 branches | 95.83 funcs
$ npm run acceptance
  Test Files  11 passed (11)    Tests  65 passed (65)
$ npm run integrity                               -> INTEGRITY: OK
$ ./demos/demo.sh samples/orders.json             -> 10 steps, all 200/201/204/400/404 as expected
$ ./demos/spec-swap.sh                            -> "reloaded ... - Gadgets API v2.0.0, 2 routes"
```

## Phase 9 - Release (orchestrator)

- `README.md`: the full project guide - what it does, a five-second quick start,
  a step-by-step PC setup (Node 20+, `npm install`, `npm run build`, run), the
  complete CLI flag table, every behaviour, the reserved API surface, the error
  envelope, the security posture, the project structure, the architecture
  diagram, the samples and demos, how to run the tests, and a troubleshooting
  section.
- `docs/architecture.png`: the architecture diagram, referenced from the README.
- `docs/PPT_FACTS.md`: every stage claim with the command that proves it.
- `demos/README.md`: how to run and present the two demos.

### Phase 9 receipts (2026-09-30)

```
$ npm run lint / typecheck / build                -> exit 0
$ npm run test:coverage
  Test Files  10 passed (10)    Tests  218 passed (218)
  All files | 93.07 stmts | 84.8 branches | 95.83 funcs
$ npm run acceptance
  Test Files  11 passed (11)    Tests  65 passed (65)
$ npm run integrity                               -> INTEGRITY: OK
$ node packages/cli/dist/index.js --help          -> exit 0, documents every flag
$ node packages/cli/dist/index.js --version       -> mockforge 0.1.0
$ node packages/cli/dist/index.js                 -> exit 1 (no spec is an error)
```

## Open issues

- none. All 12 acceptance suites pass, all unit tests pass, coverage is above the
  80% gate, and the acceptance lock verifies.

## Known limitations (documented, not bugs)

- Paths are served exactly as the spec writes them: a Swagger 2.0 `basePath` or
  an OpenAPI 3 `servers:` prefix is not prepended (`docs/CONTRACT.md` 14).
- Only local `$ref`s resolve. A remote reference is rejected and named.
- Sessions and records live in memory; restarting the mock resets them.

### Phase 0 receipts (2026-09-30, node v22.22.3)

```
$ npm run lint        -> eslint .            (0 problems)
$ npm run typecheck   -> tsc -p tsconfig.test.json --noEmit (core, cli) + dashboard  (clean)
$ npm test            -> Test Files 1 passed (1), Tests 2 passed (2)
$ npm run test:coverage
  % Stmts % Branch % Funcs % Lines
  All files     100      100     100     100     (packages/core/src/index.ts)
$ npm run build       -> tsc (core, cli) + vite build (dashboard)  (ok)
$ npm run integrity   -> INTEGRITY: OK (acceptance lock verified, no forbidden patterns)
$ node packages/cli/dist/index.js --version -> mockforge 0.1.0
```
