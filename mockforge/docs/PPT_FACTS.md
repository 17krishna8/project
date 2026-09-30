# MockForge — presentation facts

Everything below is a claim that was verified with a command in this repository.
Each fact carries the command that proves it, so nothing on stage is a guess.

Topic #16, CodeBegun HackZen 2026. Stack: TypeScript (strict), Node 20+, Fastify 5,
`@apidevtools/swagger-parser`, `@faker-js/faker` (`en_IN`), Ajv 8, Vitest,
React + Vite + Tailwind.

---

## The one-line pitch

> Point MockForge at an OpenAPI 3.0 or Swagger 2.0 spec and it gives you a running
> mock REST backend — realistic data, real state, per-session isolation, chaos
> controls and a live dashboard — in under five seconds. No code to write, no
> fixtures to maintain.

## The numbers (all measured in this repo)

| Claim | Receipt |
|---|---|
| A 200-route spec is serving in **< 5 s** | acceptance `a12.1` — "a 200-endpoint spec boots <5 s and `/__health` reports `routes: 200`" |
| **100 concurrent sessions**, all `201`, isolated, in **< 20 s** | acceptance `a12.2` |
| **300 hostile session ids** all `200`, none sharing a session | acceptance `a12.3` |
| `--max-sessions 50` holds: 300 sessions leave **≤ 50** live | acceptance `a12.5` |
| **218 unit tests**, coverage **93.07 / 84.8 / 95.83** | `npm run test:coverage` |
| **65 acceptance tests** across **12 suites** (`a01`–`a12`) | `npm run acceptance` |
| **0 lint problems**, **0 type errors**, build clean | `npm run lint`, `npm run typecheck`, `npm run build` |
| Acceptance suite is **checksum-locked** | `npm run integrity` → `INTEGRITY: OK` |
| Boot on the demo spec | `Boot: 156 ms` — `node packages/cli/dist/index.js samples/tasks.yaml --port 3300` |

Reproduce everything with:

```bash
npm install && npm run build
npm run lint && npm run typecheck && npm run test:coverage && npm run acceptance && npm run integrity
```

## The six required behaviours, and where they live

| # | Behaviour | Where |
|---|---|---|
| 1 | **Semantic data by field meaning** | `packages/core/src/generator/semantic.ts` — 46 tests in `__tests__/semantic.test.ts` |
| 2 | **Stateful in-memory CRUD** | `packages/core/src/state/store.ts` + `server/app.ts` |
| 3 | **Configurable chaos** | `server/app.ts` (per-request headers + `PUT /__admin/chaos`) |
| 4 | **Per-session isolation** | `server/sessions.ts` + `state/store.ts` |
| 5 | **Strict schema adherence** | `server/validate.ts` (Ajv, per-route cached) |
| 6 | **Fast boot, edge-capable** | `spec/loader.ts` + `spec/routes.ts`; `a12` proves the scale |

## Data generation — the demo that lands

Field **meaning**, not field type. Every rule is checked against the schema and
steps aside if it would violate a constraint.

| Field looks like | Generated |
|---|---|
| `email` | a valid address, often an Indian domain (`Rohan54@hotmail.com`) |
| `phone` / `mobile` | `+918497228367` — `^(\+91)?[6-9]\d{9}$` |
| `postalCode` | `624260` — `^[1-9][0-9]{5}$` |
| `price` / `balance` / `total` | `95380.28` — exactly two decimals |
| `createdAt` | `2026-04-29T09:58:09.114Z` — ISO-8601, inside two years |
| `status` | one of the enum values, never anything else |
| `id` | `tsk_wLSS9Nla` — matches the spec's `pattern` |
| `name` | an Indian name from `@faker-js/faker` in `en_IN` |

Real output, `curl 'http://127.0.0.1:3300/tasks?limit=2'`:

```json
{"id":"tsk_p7tl6Vza","title":"Clibanus tyrannus adsuesco","done":false,"priority":"high",
 "assigneeEmail":"Bala39@yahoo.co.in","dueDate":"2024-11-25","createdAt":"2025-09-28T22:25:43.459Z"}
{"id":"tsk_7FclU2L","title":"Deprecator terror","done":true,"priority":"medium",
 "assigneeEmail":"Kailash_Mehra30@yahoo.co.in","dueDate":"2026-08-09","createdAt":"2026-05-14T10:05:34.391Z"}
```

## CRUD, with the right status codes

```
POST   /tasks         -> 201 Created
GET    /tasks/{id}    -> 200
PATCH  /tasks/{id}    -> 200
DELETE /tasks/{id}    -> 204 No Content
GET    /tasks/{nope}  -> 404 MOCKFORGE_NOT_FOUND
POST   /tasks  (bad)  -> 400 MOCKFORGE_VALIDATION_ERROR, details: [{path:"/balance",reason:"must be >= 0"}]
```

Lists carry `X-Total-Count` (the filtered size, before paging) and understand
`limit`, `offset`, `page`, `sort`, `order` and arbitrary equality filters.
Each session is seeded with 5–10 records per resource.

## Chaos

| How | Effect |
|---|---|
| `--latency 250` | base latency on every response |
| `--error-rate 0.1 --error-split 70:30` | 10% of requests fail, 70% of those as 404 |
| `X-Mock-Latency: 800` | this response only |
| `X-Mock-Error: 1` | force a fault (404 or 500 per the split) |
| `X-Mock-Status: 418` | force exactly `418`, code `MOCKFORGE_INJECTED_418` |
| `PUT /__admin/chaos` | change it live, no restart |

**The design point worth saying out loud:** chaos only ever fires on *matched*
routes. `/__health`, `/__ui` and `/__admin/*` are ordinary Fastify routes
registered *before* the catch-all, so at 100% error rate the control plane still
answers. That is why the dashboard stays usable while you are breaking things.

## Session isolation

`X-Session-Id` → that session's own dataset. Falls back to the `mf_session`
cookie, then to a fresh random id per request, so anonymous callers never share
state by accident. Ids are capped at 64 characters from `[A-Za-z0-9_-]`; anything
else is hashed, so a hostile header cannot forge or collide with another caller's
session. `a12.3` proves it with 500-character ids, spaces, `!!!`,
`../../etc/passwd`, `__proto__`, `constructor` and `<script>`.

## Security — the spec is untrusted input

| Threat | Defence |
|---|---|
| SSRF via a remote `$ref` | remote references rejected and named (`a03.3`) |
| Huge spec | refused over 5 MB (`a03.4`) |
| Infinite `$ref` recursion | depth + step limits; circular specs boot (`a03.1`) |
| Catastrophic regex backtracking | pattern matching runs under a step budget |
| Prototype pollution | `__proto__`/`constructor`/`prototype` bodies → `400 MOCKFORGE_INVALID_JSON_BODY` |
| Session forgery | 64-char `[A-Za-z0-9_-]` ids, hashed on violation |
| Request flooding | bodies over 1 MB → `413 MOCKFORGE_BODY_TOO_LARGE` |

## The dashboard

`/__ui`, served by the mock itself on the same origin — no proxy, no second dev
server, no CORS. Route table, sessions panel with per-session data, chaos
sliders, and the SSE request log streaming live.

If the built bundle is ever missing the server renders a self-contained
fallback page with the same features, so `/__ui` is never a blank screen.

## Architecture, in one breath

```
OpenAPI 3.0 / Swagger 2.0 (JSON or YAML)
  -> spec/loader.ts     size caps, remote-$ref rejection, line/column errors
  -> spec/routes.ts     paths -> routes + resources, id-field detection
  -> spec/refs.ts       local $ref resolution, cycle + depth limits
  -> generator/         semantic rules -> seeded PRNG -> pattern engine
  -> state/store.ts     per-session records, TTL, LRU, caps, sweep
  -> server/app.ts      Fastify catch-all, validation, chaos, error envelope
```

See `docs/architecture.png`.

**The structural choice:** everything before `server/app.ts` is pure TypeScript
with no HTTP dependency, so parsing, routing, generation and state are all
unit-testable without a socket. Fastify is a thin adapter over them.

## Two bugs this project found in itself

Worth mentioning if the judges ask about engineering depth — both were found by
the test suite, not by inspection:

1. **`multipleOf` vs IEEE-754.** The generator produced a correct two-decimal
   price and Ajv rejected it as "must be multiple of 0.01", because
   `1234.56 / 0.01 === 123455.99999999999`. Fixed by evaluating `multipleOf`
   with decimal arithmetic (shift both operands by the same power of ten and
   compare as integers). `1234.56` passes, `1234.567` does not.
2. **A stale time anchor.** A hardcoded "now" made every timestamp test pass
   until it silently expired. Replaced with an anchor quantised to the UTC day,
   so "within two years" stays true forever.

## Live demo script (about 3 minutes)

```bash
./demos/demo.sh
```

Ten steps, every command and response printed: boot → health → routes →
semantic data → CRUD → validation → session isolation → chaos → SSE log →
dashboard.

```bash
./demos/spec-swap.sh
```

Hot reload: edit the spec file and the mock follows — new routes, new data, old
paths `404`, sessions intact.

## Judging criteria, mapped

| Criterion | Evidence |
|---|---|
| **Architecture (20)** | pure-TS core behind a thin Fastify adapter; reserved paths registered before the catch-all; 17 documented decisions in `docs/CONTRACT.md` |
| **Reliability / Security (20)** | 218 unit tests, 65 acceptance tests, coverage 93%; every spec-input threat defended; error envelope with named codes |
| **Engineering depth (20)** | own `$ref` resolver with cycle limits, regex pattern engine, seeded PRNG, TTL/LRU store, hand-written SSE, dev-mode response validation that caught two real bugs |
| **DX (15)** | one command to a running backend; `--help` self-documenting; `README.md` with a PC setup walkthrough; three sample specs; two transcript-producing demos |
| **Scalability (15)** | 200-route spec < 5 s; 100 concurrent sessions < 20 s; 300 hostile ids safe; `--max-sessions` LRU eviction |
| **Demo / Code (10)** | `demos/demo.sh`, `demos/spec-swap.sh`, and the live dashboard |

## If something goes wrong on stage

| Symptom | Fix |
|---|---|
| `Cannot find module '@mockforge/core'` | run `npm run build` from the repo root (core compiles before the CLI) |
| Dashboard shows the plain page | `apps/dashboard/dist` is missing — `npm run build`. The fallback page means `/__ui` still works |
| `404` on a path that is in the spec | paths are served verbatim; a `basePath` prefix is not prepended |
| Data differs between runs | pass `--seed 42` and send an explicit `X-Session-Id` |
| `500 MOCKFORGE_SCHEMA_MISMATCH` | dev mode caught the mock breaking its own spec; run with `--mode prod` |
