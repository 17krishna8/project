# BUDGET.md - one row per session

Token estimate when the platform number is unknown: (characters read + characters written) / 4.

| time (UTC) | phase | role | task | estimated tokens | cumulative |
|---|---|---|---|---|---|
| 2026-09-30T08:05Z | 0 | orchestrator+builder | harness scaffold, tooling, CI, integrity scripts | 96,000 | 96,000 |
| 2026-09-30T08:25Z | 1 | qa-auditor | acceptance contract: fixtures + suites a01-a12 | 210,000 | 306,000 |
| 2026-09-30T08:50Z | 2 | spec engineer | spec loader, router, generator, store, server, CLI, unit tests | 340,000 | 646,000 |
| 2026-09-30T09:20Z | 3 | data engineer | field-meaning rules, constraint guard, semantic test suite | 190,000 | 836,000 |
| 2026-09-30T09:55Z | 4 | backend engineer | CRUD, list queries, session lifecycle, admin endpoints | 230,000 | 1,066,000 |
| 2026-09-30T10:30Z | 5 | reliability engineer | chaos injection, Ajv validation, dev/prod mode | 260,000 | 1,326,000 |

| 2026-09-30T11:00Z | 6 | spec engineer | admin surface, SSE log ring, POST /__admin/spec, --watch, two loader fixes | 300,000 | 1,626,000 |
| 2026-09-30T11:25Z | 7 | UI engineer | React dashboard, /__ui static handler + fallback page, CLI flags, build-order fix | 320,000 | 1,946,000 |
| 2026-09-30T11:50Z | 8 | qa-auditor | multipleOf decimal fix, X-Mock-Error, error-code mapping, XSS escape, samples, demos | 240,000 | 2,186,000 |
| 2026-09-30T12:05Z | 9 | orchestrator | README project guide, architecture diagram, PPT facts, PROGRESS/BUDGET | 110,000 | 2,296,000 |

| 2026-09-30T13:15Z | 10 | DX engineer | spec upload endpoint, no-spec boot, upload view, endpoint explorer, tests + docs | 260,000 | 2,556,000 |

## Caps (playbook B7)

| Phase | Cap |
|---|---|
| 0 | 250,000 |
| 1 | 400,000 |
| 2 | 700,000 |
| 3 | 600,000 |
| 4 | 600,000 |
| 5 | 400,000 |
| 6 | 500,000 |
| 7 | 700,000 |
| 8 | 400,000 |
| 9 | 150,000 |

Stop rules: 80% of a phase cap -> stop starting new tasks. 100% -> stop everything.
4,500,000 total -> stop and ask the human.
