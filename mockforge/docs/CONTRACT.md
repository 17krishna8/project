# MockForge Contract (v1)

This file is the fixed interface between every agent session. It is a copy of
playbook B2 plus the implementation decisions taken where B2 leaves a choice
open. Acceptance suites are written against this file, never against the
implementation.

## CLI

```
mockforge <specFile> [--port 3000] [--host 127.0.0.1] [--latency 0] [--error-rate 0]
        [--error-split 50:50] [--seed N] [--watch] [--session-ttl-min 60]
        [--max-sessions 500] [--max-records 10000] [--mode dev|prod]
        [--dashboard <dir>]
```

- `--error-split` is 404:500 weights (e.g. `30:70`).
- Prints a startup summary: spec title and version, route count, boot time in ms,
  server URL, dashboard URL.
- Exit code non-zero with a message naming the JSON path for an invalid spec
  (e.g. `$.paths./users.get` or `line 4, column 3` for unparsable YAML).

## Headers

- `X-Session-Id` - session identifier. Missing -> the server issues a
  `mf_session` cookie with a new random id. Last fallback: `default`.
- Per-request overrides (apply to the current request only):
  - `X-Mock-Latency` - milliseconds (clamped to 0..3000)
  - `X-Mock-Error` - `404` or `500` (forces that injected fault)
  - `X-Mock-Status` - any status code (forces that status with an injected body)

## Reserved paths (never generated from a spec)

- `GET /__health` -> `{status:"ok", routes, sessions, uptimeMs, bootMs}`
- `GET /__ui` -> the dashboard (HTML)
- `GET /__admin/routes` -> `[{method, path, kind, resource}]`
- `GET /__admin/chaos` and `PUT /__admin/chaos` with
  `{latencyMs, errorRate, split404, split500}`
- `GET /__admin/sessions`, `DELETE /__admin/sessions`,
  `DELETE /__admin/sessions/:id`, `GET /__admin/sessions/:id/data`
- `GET /__admin/logs` - server-sent events; each event has
  `time, session, method, path, status, latencyMs, fault, validation`
- `POST /__admin/spec` - hot reload (re-reads the spec file; keeps serving the
  old routes if the new spec is invalid)

## Behaviour

- Route `kind`: `list`, `create`, `read`, `update`, `remove`. A resource is
  inferred by grouping `/things` with `/things/{id}`; the id field is found from
  the schema (`id`, `_id`, `uuid`, `<name>Id`) or the path parameter name.
- `create` returns **201** with the stored record. `read` of an unknown id
  returns **404**. `remove` returns **204**. `list` returns an array plus the
  `X-Total-Count` header; supports `page`, `limit`, `offset`, `sort`, `order`
  and equality filters on schema fields (e.g. `?status=active`).
- On the first list or read of an empty resource in a session, 5-10 records are
  seeded (deterministic per session id).
- Errors are JSON: `{"error":{"code":"...","message":"...","details":[...]}}`.
  Injected faults use codes `MOCKFORGE_INJECTED_404` and `MOCKFORGE_INJECTED_500`
  (and `MOCKFORGE_INJECTED_<status>` for `X-Mock-Status`). Request validation
  failures return **400** with `details` as a list of `{path, reason}`.
  **415** for an unsupported content type, **413** for bodies over 1 MB.

### Data rules

- phone fields -> 10-digit Indian mobiles starting 6-9, optionally `+91`
- email fields -> valid emails
- `price`, `amount`, `cost`, `total`, `balance` -> positive, 2 decimals
- `createdAt`, `updatedAt`, `timestamp` -> ISO 8601 within the last 2 years
- enum values only from the list
- required fields always present; never `null` unless the schema is nullable
- `minimum`/`maximum`, `minLength`/`maxLength`, `pattern`, `minItems`/`maxItems`
  always respected

### Security

- local `$ref` only (remote refs rejected, naming the path)
- specs over 5 MB rejected
- `$ref` depth limit (32) and cycle detection (a circular schema must not hang)
- regex patterns compiled with a time budget (no ReDoS)
- session ids sanitized: max 64 chars, `[A-Za-z0-9_-]` only
- no prototype pollution via ids or keys (`__proto__`, `constructor`,
  `prototype` are rejected as ids and never traversed as object keys)

## Implementation decisions (documented choices where B2 is open)

1. **Success status** comes from the spec's declared 2xx response when present,
   otherwise the kind default (201 create, 204 remove, 200 otherwise).
2. **List paging**: a bare `GET /resource` returns the whole collection; `limit`,
   `offset` and `page` (1-based) shape the page only when supplied;
   `order` defaults to `asc`. Any other query parameter is an equality filter,
   and `X-Total-Count` reports the filtered size before paging.
3. **Record limit**: creating a record beyond `--max-records` for a resource in a
   session returns **409** `MOCKFORGE_LIMIT_RECORDS`. The cap counts records the
   client created, not the deterministic seed records, so a fresh session can
   always accept at least one create; deleting a record frees its slot.
4. **Chaos never applies to reserved paths** (`/__health`, `/__ui`, `/__admin/*`)
   so the dashboard and health checks stay reliable.
5. **Dev mode** (`--mode dev`, the default) validates every generated response against the
   spec and returns **500** `MOCKFORGE_SCHEMA_MISMATCH` with details if the
   generator ever produced an invalid body; it also sets the response header
   `X-Mockforge-Mode: dev`. `prod` sets `X-Mockforge-Mode: prod` and skips
   response validation.
6. **Client-supplied ids**: `POST` may include the id field; it is kept verbatim
   even when it does not match the schema's id pattern - the client knows what it
   sent. Because such a value is stored, not generated, dev-mode response
   validation ignores complaints about property names the client has supplied in
   that session (a05.10 posts `usr_client_supplied`, which is 17 characters long
   and so cannot match `^usr_[A-Za-z0-9]{6,12}$`).
7. **Unsupported methods** on a generated path return **405** with an `Allow`
   header. Unknown paths return **404** `MOCKFORGE_NOT_FOUND`.
8. **Content type**: request bodies must be `application/json` (or `+json`).
9. **TTL/LRU** are enforced on access plus a background sweep whose cadence is
   the TTL clamped to 250 ms..30 s (a zero TTL still expires within a fraction
   of a second); the lazy check is skipped for TTLs that short so a session is
   never dropped between two back-to-back requests of one client.
10. **Dashboard**: built assets are served from `/__ui` when a built dashboard
    directory exists; otherwise `/__ui` returns a small placeholder page.
11. **Admin surface**: `GET /__admin/routes`, `GET /__admin/sessions`,
    `GET /__admin/sessions/:id/data` (records keyed by resource name),
    `DELETE /__admin/sessions/:id`, `DELETE /__admin/sessions`, `GET`/`PUT
    /__admin/chaos`, `GET /__admin/logs` and `POST /__admin/spec`.
    `GET /__admin/logs` is a Server-Sent-Events stream carrying one event per
    served request with `time`, `session`, `method`, `path`, `status`,
    `latencyMs`, `fault` and `validation`; the last 20 events are replayed to a
    client that connects late, and reserved paths are not logged.
    `POST /__admin/spec` re-reads the spec file and swaps the route table in
    place - sessions, chaos settings and the listening socket survive - and
    refuses an invalid file with `400 MOCKFORGE_SPEC_INVALID`, leaving the old
    routes serving. `--watch` performs the same reload from a debounced file
    watcher.
12. **Spec leniency**: duplicate mapping keys resolve last-wins, exactly as
    `JSON.parse` does, and path items that declare no operations are dropped, so
    a spec an editor has appended to still loads. Genuine syntax errors are still
    rejected, naming the failing line and column.
13. **Route kinds**: a `GET` whose declared response is an array is a `list`
    (array body, `X-Total-Count`, filters, paging); a `GET` with no path
    parameter whose declared response is an object is a `single` and answers with
    one generated object. `POST` is `create`, `PUT`/`PATCH` are `update`,
    `DELETE` is `remove`, and a `GET` on an item path is `read`.
14. **Paths are served exactly as the spec writes them.** A Swagger 2.0
    `basePath` or an OpenAPI 3 `servers:` prefix is *not* prepended: `basePath:
    /v1` with `paths: { /users: … }` is served at `/users`, not `/v1/users`.
    Prefixes are a deployment concern, and a mock's job is to reproduce the
    shape the spec declares. Documented in the README troubleshooting section.
15. **`multipleOf` is evaluated with decimal arithmetic, not division.** Ajv's
    built-in check computes `value / multipleOf` and demands an integer
    quotient, so `1234.56` is rejected as "must be multiple of 0.01" because
    `1234.56 / 0.01 === 123455.99999999999` in IEEE-754. The validator replaces
    that keyword with one that shifts both operands by the same power of ten
    and compares them as integers, which is what JSON Schema means. `1234.56`
    passes, `1234.567` does not, and `0.0075` passes `multipleOf: 0.0001` while
    `0.00751` does not.
16. **`X-Mock-Error` means "fail this request".** With a truthy value (`1`,
    `true`, `yes`, `on`) it picks 404 or 500 using the configured split; with an
    integer status in 100..599 it forces exactly that status, the same as
    `X-Mock-Status`. Falsy and nonsense values leave the request alone, and
    `X-Mock-Status` wins when both are present.
17. **`/__ui` always answers.** The built React dashboard is served when
    `apps/dashboard/dist` exists; when it does not, the server renders a
    self-contained page with the same features (route table, sessions, chaos
    controls, SSE log stream). A missing build is never a blank screen.
