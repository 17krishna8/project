# AGENT_PLAYBOOK.md

> **ADAPTATION NOTE (single-session execution).** The playbook below was written
> for a multi-session relay: a human pasting prompts into fresh agent sessions on
> a GitHub repo, with branch protection, PRs and separate reviewer sessions as
> the gates. This repository is being built in ONE continuous agent session, so
> the gates are executed locally instead of by GitHub:
>
> - The repository is still the only memory (`PROGRESS.md`, `BUDGET.md`,
>   `PHASE_CURRENT`, `docs/CONTRACT.md`, this playbook).
> - Acceptance suites are still written BEFORE any implementation (Phase 1),
>   from B1/B2 only, and are hash-locked; `npm run integrity` enforces the lock,
>   the forbidden patterns and the protected paths.
> - Every claim still comes with receipts: the command and the last 20 lines of
>   its real output, pasted into `PROGRESS.md` and shown at each phase gate.
> - The mutation sanity check (3 deliberate bugs must turn suites red) and the
>   red-team pass still run at every phase gate.
> - The human gate is still real: after each phase the human runs
>   `demos/phase-N.md` and approves. The human (not the agent) owns
>   `PHASE_CURRENT`, `acceptance/`, `.github/` and `AGENT_PLAYBOOK.md`.
> - GitHub-only mechanics (labels, real PRs, branch protection, the
>   `review-gate` check) ship as files in this repo and become active the moment
>   the human pushes it to GitHub.

---

Goal: agents in LLM Arena's agent mode build MockForge (CodeBegun HackZen 2026, Topic #16), open their own pull requests, and merge them when independent checks pass. You approve every phase after a live demo. Your teammates make the presentation only.

The key design problem: in agent mode each prompt may be handled by a DIFFERENT model, and you cannot predict which. So this setup assumes nothing about the model, and nothing about special features (no subagents, no skills, no hooks, no memory between sessions). What it relies on instead:

- The repository is the only memory (files: `PROGRESS.md`, `BUDGET.md`, `PHASE_CURRENT`, `docs/CONTRACT.md`, this playbook).
- Every prompt is self-contained and starts with the same short header of hard rules.
- Every claim must come with receipts (the command and its real output), and independent checks (CI plus a separate reviewer session) decide, not the builder.
- Tasks are small, steps are numbered, output formats are strict, so weaker models still succeed and stronger models cannot skip steps.

How this file is used:

- Commit it to the repo root as `AGENT_PLAYBOOK.md`.
- Part A is for you (setup, budget, token, routine).
- Part B is read by the agents (rules, contract, roles, phases).
- Part C holds the prompts you paste, one at a time.

---

## 1. Create an empty GitHub repo `mockforge` (public is easiest: branch protection is free on public repos; on private repos it needs a paid plan).

## 2. Copy this file into the repo as `AGENT_PLAYBOOK.md` (GitHub web upload is fine) and commit it to `main`.

## 3. Connect the repo to the agent mode session (A2). Note the exact way it can create PRs and see CI results; the capability probe in P0 will confirm.

## 4. Paste P0. It ends with a PR for you to review and merge yourself.

## 5. After merging the Phase 0 PR:

- Remove the **Workflows** permission from the token (if you used one).
- Turn on branch protection for `main` (Settings, Branches): require a pull request, require the status checks `ci`, `acceptance`, `integrity`, `review-gate`, block force pushes. The check names only appear after the first CI run.
- Confirm `CODEOWNERS` lists your GitHub username for `acceptance/`, `PHASE_CURRENT`, `.github/`.

## 6. Paste P1 (test contract). Read the PR it opens (test list and sample specs) and merge it yourself.

## 7. Then run each phase with P2 (build), P3 (review), P4 (gate), see A4.

## A4. Routine for every phase

Because there is no reliable "main agent" that can call other agents in Arena, YOU relay between sessions. Per phase you paste about 4 to 8 prompts:

1. P2 with N, repeatedly, until it reports `PHASE TASKS COMPLETE`. Each P2 run does ONE task: implements it, opens a PR, and prints `NEXT: paste P3 with PR=<number>`.
2. P3 with the PR number in a NEW session. This is the independent reviewer. If the session tells you it wrote or touched this PR, discard it and re-run in a new session. If Arena lets you pick a different model for this session, pick a different one.
3. Back to P2 (it merges the PR if CI is green and the review comment exists, then starts the next task).
4. When all tasks are done, paste P4 (phase gate: QA audit, sanity mutation check, red-team, demo file).
5. P4 ends with `HUMAN GATE`. Open `demos/phase-N.md` and run the commands exactly. If good, edit `PHASE_CURRENT` on GitHub (web editor) to N+1 and commit. If not, paste P6 with your note.

Rerolls: if a session returns results without receipts, skips steps, or does not end with the STATUS line, do not argue: paste the same prompt again in a new session.

Your teammates use `docs/PPT_FACTS.md` (created in Phase 9) for real numbers, the architecture diagram source and the screenshot list.

## A5. Model variance: risks and how this setup handles them

| Risk | Handling |
| --- | --- |
| A weaker model skips steps or claims success without running anything | Numbered checklists; RECEIPTS required; CI and a separate reviewer session decide; you reroll if receipts are missing |
| Different models format output differently | Strict final format: a STATUS line and a NEXT line at the end of every message |
| No memory between sessions | All state in repo files; every prompt starts by reading them |
| Agent mode lacks a tool (shell, PR creation) | Capability probe B0; if a needed capability is missing the session stops with `STATUS: BLOCKED` instead of pretending |
| One model reviews its own work | Reviewer is a separate prompt in a new session, ideally a different model; reviewer re-runs the tests |
| Model edits the tests to pass | Acceptance tests are written first by a separate QA session, hash-locked, and protected by CI and by your branch protection |
| Overspending | Small tasks, per-phase caps, ledger, your usage checks |
| Different context sizes | Prompts are short; details live in files that are read only as needed |

---

# PART B: AGENT PLAYBOOK (agents read this)

## B0. Capability probe (every session, first action)

Run these and print the result table exactly:

- `node -v && npm -v && git --version`
- `gh --version` (may not exist)
- `git remote -v` and `git status`
- Can you (a) run shell commands, (b) push a branch to GitHub, (c) create a pull request, (d) read CI status of a pull request, (e) run `npm install` (network)?

Print: `CAPS: SHELL=yes/no GIT=yes/no GH_CLI=yes/no PUSH=yes/no PR_CREATE=<gh|api|platform|none> CI_READ=<gh|api|platform|none> NPM=yes/no`

If you can run shell commands but have no `gh`, use `git push` plus the GitHub REST API with `curl` and the token from the environment variable (never echo it), or the platform's GitHub tool. If SHELL=no, PUSH=no or PR_CREATE=none, stop with `STATUS: BLOCKED` and explain what is missing.

## B1. The real problem (never lose sight of it)

Frontend and mobile teams sit idle because backend APIs are not ready. Existing mock servers return hardcoded static JSON or random garbage (a random string as a phone number, a negative price). When the real backend arrives, schema mismatches and unexpected nulls cause cascading bugs.

MockForge is a mock server GENERATOR: input an OpenAPI 3.0 or Swagger 2.0 spec (JSON or YAML), get a running mock REST server in under 5 seconds that behaves like the real backend:

1. Data chosen by field MEANING, not only type: valid emails, Indian mobile numbers, realistic ISO timestamps, sensible currency.
2. Stateful in-memory CRUD: POST creates, later GET returns it, PUT and PATCH update, DELETE removes.
3. Configurable chaos: latency 0 to 3000 ms, random 404 and 500 with configurable rates.
4. Zero persistence leaks: state isolated per session (`X-Session-Id`).
5. Strict schema adherence: types, required, enum, min, max, pattern always respected.
6. Fast boot, lightweight, runs locally or on serverless edge runtimes.

Judging weights: Architecture 20, Reliability and Security 20, Engineering Depth 20, Developer Experience 15, Scalability 15, Live Demo and Code 10.

Stack: TypeScript strict, Node 20+, Fastify, @apidevtools/swagger-parser, @faker-js/faker (en_IN), Ajv, Vitest, React + Vite + Tailwind. npm workspaces: `packages/core`, `packages/cli`, `apps/dashboard`.

## B2. The contract (fixed interfaces; saved as docs/CONTRACT.md)

CLI: `mockforge <specFile> [--port 3000] [--host 127.0.0.1] [--latency 0] [--error-rate 0] [--error-split 50:50] [--seed N] [--watch] [--session-ttl-min 60] [--max-sessions 500] [--max-records 10000] [--mode dev|prod]`. `--error-split` is 404:500 weights. Prints a startup summary (spec title and version, route count, boot time in ms, URL, dashboard URL). Exit code non-zero with a message naming the JSON path for an invalid spec.

Headers: `X-Session-Id` (session; missing means a cookie `mf_session` is issued; last fallback `default`). Per-request overrides: `X-Mock-Latency` (ms), `X-Mock-Error` (404 or 500), `X-Mock-Status` (any status).

Reserved paths (never generated from a spec):

- `GET /__health` returns `{status:"ok", routes, sessions, uptimeMs, bootMs}`
- `GET /__ui` returns the dashboard (HTML)
- `GET /__admin/routes` returns `[{method, path, kind, resource}]`
- `GET /__admin/chaos` and `PUT /__admin/chaos` with `{latencyMs, errorRate, split404, split500}`
- `GET /__admin/sessions`, `DELETE /__admin/sessions`, `DELETE /__admin/sessions/:id`, `GET /__admin/sessions/:id/data`
- `GET /__admin/logs` (server-sent events; each event has time, session, method, path, status, latencyMs, fault, validation)
- `POST /__admin/spec` (hot reload)

Behavior:

- Route `kind`: list, create, read, update, remove. Resource inferred by grouping `/things` and `/things/{id}`; ID field found from schema (`id`, `_id`, `uuid`, `<name>Id`).
- Create returns 201 with the stored record. Read of an unknown ID returns 404. Delete returns 204. List returns an array and header `X-Total-Count`; supports `page`, `limit`, `offset`, `sort`, `order` and equality filters on schema fields.
- On first list or read of an empty resource in a session, seed 5 to 10 generated records (deterministic per session ID).
- Errors are JSON: `{"error":{"code":"...","message":"...","details":[...]}}`. Injected faults use codes `MOCKFORGE_INJECTED_404` and `MOCKFORGE_INJECTED_500`. Request validation failures return 400 with `details` as a list of `{path, reason}`. 415 for unsupported content type, 413 for bodies over 1 MB.
- Data rules: phone fields give 10-digit Indian mobiles starting 6 to 9 (optionally +91); email fields valid emails; price, amount, cost, total positive with 2 decimals; createdAt, updatedAt, timestamp ISO 8601 within 2 years; enum values only from the list; required fields always present; never null unless nullable; min and max respected.
- Security: local `$ref` only (remote refs rejected), specs over 5 MB rejected, ref depth limit, regex timeouts, sanitized session IDs (max 64 chars, `[A-Za-z0-9_-]`), no prototype pollution via IDs or keys.

## B3. Roles (a role is a prompt, not a feature of the platform)

Any session takes exactly one role, named in the header of its prompt. A session must not switch roles.

- **ORCHESTRATOR (prompt P2, P4):** picks the next task from the backlog, creates the issue and branch, does the small builder work itself (or delegates only if the platform truly supports delegation to another agent; otherwise it builds), opens the PR, waits for CI, merges when the gates pass, updates `PROGRESS.md` and `BUDGET.md`, and runs the phase gate.
- **BUILDER (part of P2):** the specialty comes from the phase table in B7: spec engineer, data engineer, state engineer, UI engineer. It only touches the folders listed for that phase.
- **REVIEWER (prompt P3):** a different session from the one that built the PR. Read-only by rule. Re-runs the tests, applies the checklist, and posts one comment `REVIEW-APPROVED sha=<head sha>` or `REVIEW-CHANGES` with a numbered list.
- **QA-AUDITOR (prompts P1, P4):** writes the acceptance tests before any implementation exists, from B1 and B2 only, and at each gate audits, runs the sanity mutation check and red-teams.

Task sizing: every task is small enough for one session: at most about 300 changed lines, one clear outcome, one PR. If a task is bigger, split it into several issues first.

## B4. Trust chain for every change

1. Task issue exists (label `phase-N`). Builder works on branch `agent/p<N>-<task>`.
2. Builder runs `npm run lint`, `npm run typecheck`, `npm test`, `npm run acceptance -- --upto <N>`; fixes failures; maximum 3 attempts per distinct failure; then writes `BLOCKED.md`, opens an issue, and ends with `STATUS: BLOCKED`.
3. Builder opens a PR from the template with RECEIPTS (each command and the last 20 lines of its real output).
4. CI runs `ci`, `acceptance`, `integrity`. All must be green.
5. A separate REVIEWER session comments `REVIEW-APPROVED sha=<head sha>`; the `review-gate` check requires it for the current head commit.
6. ORCHESTRATOR merges (squash) only `agent/*` branches, only when all checks are green and the review comment exists. `qa/*`, `boot/*` and `human/*` branches are merged by the human.
7. At the end of the phase, the gate in B7 runs, and the human demo decides.

## B5. Repository files and CI (created in Phase 0)

Layout: `AGENT_PLAYBOOK.md`, `PROGRESS.md`, `BUDGET.md`, `PHASE_CURRENT` (one number), `BLOCKED.md` (only when needed), `docs/CONTRACT.md`, `demos/`, `acceptance/` (fixtures, suites, `phases.json`, `.lock`), `samples/`, `scripts/`, `packages/core`, `packages/cli`, `apps/dashboard`, `.github/`.

Root scripts in `package.json`: `build`, `lint`, `typecheck`, `test`, `acceptance` (runs suites whose phase is at most `--upto`; default is the value in `PHASE_CURRENT`).

Workflows (`.github/workflows/`):

1. `ci`: Node 20, `npm ci`, lint, typecheck, unit tests with coverage threshold 80% for `packages/core` (threshold stored in `scripts/integrity/thresholds.json`).
2. `acceptance`: build, then `npm run acceptance` using `PHASE_CURRENT`; upload logs.
3. `integrity` (fails the PR if any rule breaks):
   - `acceptance/.lock` must equal the SHA-256 of all files under `acceptance/` (except `.lock`); `scripts/update-acceptance-lock.sh` produces it.
   - A PR from a branch starting with `agent/` must not change: `acceptance/**`, `PHASE_CURRENT`, `.github/**`, `scripts/integrity/**`, `CODEOWNERS`, `AGENT_PLAYBOOK.md`.
   - The PR diff must not add forbidden patterns (B8).
4. `review-gate`: the PR must have a comment `REVIEW-APPROVED sha=<current head sha>` and a non-empty RECEIPTS section in the body.

Honest limit: these gates stop lazy or accidental weakening of the tests. They cannot stop an agent that has admin rights, which is why the token has no Administration permission and you, the human, own branch protection, `acceptance/` and `PHASE_CURRENT`. Because all sessions share one GitHub identity, the review gate is a comment check, not a GitHub review approval; your demo gate is the real final check.

## B6. Reviewer checklist

1. Scope: the changed files are inside the allowed folders for this phase.
2. Contract: behavior matches B2 (status codes, headers, error shapes).
3. Forbidden patterns (B8) are absent.
4. Evidence: re-run lint, typecheck, unit tests and acceptance yourself; do not trust the PR text.
5. Tests are meaningful: assertions check behavior, not just that code runs.
6. No shared mutable state outside the per-session store; no globals holding user data.
7. Security items in B2 are respected.
8. Each RECEIPTS entry matches what you observed.

Comment format, exactly one comment: `REVIEW-APPROVED sha=<full head sha>` followed by a short list of what you re-ran, or `REVIEW-CHANGES` followed by a numbered list.

## B7. Phases and the gate

| # | Name | Builder specialty | Suites that must pass (cumulative) | Human demo shows | Cap |
| --- | --- | --- | --- | --- | --- |
| 0 | Harness | orchestrator | none | CI green on the harness | 250k |
| 1 | Test contract | qa-auditor | none (suites written, red for the right reason) | You read the test list, fixtures and how each maps to B1 | 400k |
| 2 | Walking skeleton | spec engineer | a01 boot and routes, a02 swagger2 parity, a03 spec robustness | Boot `users.yaml` in under 5 s, curl each route, Swagger 2 works, bad spec message names the path | 700k |
| 3 | Semantic data | data engineer | + a04 semantic data | Indian phones, emails, INR prices, enums, timestamps; `--seed` repeatable | 600k |
| 4 | State and sessions | state engineer | + a05 CRUD, a06 isolation, a07 limits | POST then GET; DELETE then 404; second session sees nothing; TTL and LRU | 600k |
| 5 | Chaos and validation | state engineer | + a08 chaos, a09 validation | 2000 ms latency, 30% errors, precise 400, schema-checked responses | 400k |
| 6 | Admin and reload | spec engineer | + a10 admin and reload | Admin routes, live log stream, hot reload after editing the spec | 500k |
| 7 | Dashboard and CLI | UI engineer | + a11 UI and CLI | Dashboard sliders and session reset change behavior live | 700k |
| 8 | Hardening | qa-auditor with all | + a12 hardening | 200-endpoint boot time, 100-session load numbers, red-team report | 400k |
| 9 | Release | orchestrator | all | Clean-clone run, README, `docs/PPT_FACTS.md` | 150k |

Allowed folders by specialty: spec engineer: `packages/core/src/spec`, `routes`, `server`. Data engineer: `packages/core/src/generator`, `validation`. State engineer: `packages/core/src/state`, `chaos`. UI engineer: `apps/dashboard`, `packages/cli`, `docs`, `README.md`. QA-auditor: `acceptance/**` on `qa/*` branches only.

Acceptance suites (written in Phase 1, all black-box: start the `mockforge` CLI on a free port and call HTTP):

- a01 boot and routes: boot each fixture in under 5 s; every path and method answers with the documented status; unknown path 404.
- a02 swagger2 parity: the Swagger 2.0 fixture behaves like its OpenAPI 3 twin.
- a03 spec robustness: circular refs do not hang; malformed spec exits non-zero naming the path; remote `$ref` rejected; over-5 MB spec rejected.
- a04 semantic data: phone regex `^(\+91)?[6-9]\d{9}$`, email format, prices non-negative with 2 decimals, enums, required fields, min and max, ISO timestamps, `--seed` determinism, over 1,000 objects per fixture.
- a05 CRUD: create, read, update (PUT and PATCH), delete, list, filter, pagination, client-supplied ID.
- a06 session isolation: two sessions, missing header, concurrent sessions, reset.
- a07 limits: TTL expiry, max sessions with LRU eviction, max records per session.
- a08 chaos: latency within 50 ms of setting, clamp above 3000, error rate within 5% over 1,000 calls, split, header overrides, fault body shape.
- a09 validation: 400 with path and reason, 415, 413, every response validated by an independent Ajv in the test, dev-mode behavior.
- a10 admin and reload: all `/__admin` routes, chaos PUT takes effect, log stream fields, `POST /__admin/spec`, `--watch`.
- a11 UI and CLI: `/__ui` returns HTML, CLI help, flags, exit codes, startup summary.
- a12 hardening: 200-endpoint fixture boots in under 5 s, 100 concurrent sessions stay responsive, session ID sanitization, prototype pollution, memory stays bounded.

Fixtures (in `acceptance/fixtures/`): `users.yaml` (id, name, email format email, phone described as Indian mobile number, status enum active and blocked, balance number minimum 0, createdAt date-time), `petstore.yaml`, the Swagger 2.0 twin of each, `circular.yaml`, `malformed.yaml`, `remote-ref.yaml`, a generator for a 200-endpoint spec.

Phase gate (prompt P4, run when all tasks of the phase are merged):

1. All suites up to N pass in CI on `main`.
2. QA-auditor session runs everything on `main`, then the sanity mutation check (in a temp copy apply 3 deliberate bugs, for example remove the session check, allow a negative price, ignore enum; confirm the suites turn red; report any bug the suites miss), then red-teams the new features (session leak attempts, malformed specs, oversized bodies, `__proto__` keys, ReDoS patterns) and files issues. `severity-high` issues must be fixed first.
3. Write `demos/phase-N.md` (exact commands, expected output, at most 10 steps, timing included) and a short phase report in `PROGRESS.md` (results, budget, open issues).
4. STOP. Print exactly: `HUMAN GATE: Phase N ready. Run demos/phase-N.md, then set PHASE_CURRENT to N+1 and paste the next prompt.`

## B8. Rules for every session

1. Only touch your allowed folders. Never touch: `acceptance/**`, `PHASE_CURRENT`, `.github/**`, `scripts/integrity/**`, `CODEOWNERS`, `AGENT_PLAYBOOK.md` (except QA-auditor on `qa/*` branches and the orchestrator in Phase 0).
2. Forbidden patterns: `.skip`, `.only`, `xit(`, `xdescribe(`, `todo` tests, `|| true` after test commands, `--passWithNoTests`, `continue-on-error`, lowering a threshold, deleting or loosening an assertion to make a test pass, hardcoding fixture values in production code.
3. Never print, log or commit a token or secret. Never run `git push --force`, delete the repo, or run commands outside the repo folder.
4. Report only what you observed by running it. Every claim of "passes" comes with the command and the last 20 lines of output. If you did not run it, say so plainly.
5. Fix loop: at most 3 attempts per distinct failure. Then write `BLOCKED.md`, open an issue, and stop. Do not thrash.
6. Keep context small: `tail -n 40`, `git diff --stat`, read only needed files. Do not paste large files into messages.
7. No new dependency without a one-line reason in the PR.
8. Budget ledger `BUDGET.md`: one table row per session: `time | phase | role | task | estimated tokens | cumulative`. Use the number the human gives you; otherwise estimate as (characters read plus written) divided by 4. Stop rules: at 80% of a phase cap stop starting tasks; at 100% stop everything; at 4,500,000 total stop and ask the human.
9. Every message ends with two lines: `STATUS: DONE | BLOCKED | WAITING_FOR_HUMAN` and `NEXT: <the exact prompt the human should paste, with its numbers filled in>`.

## B9. PR template (.github/pull_request_template.md)

Sections: Summary; Issue (`Closes #n`); Phase and task; Files changed (confirm inside allowed folders); RECEIPTS (command plus last 20 lines of output for lint, typecheck, test, acceptance); Acceptance suites now passing; Estimated tokens used; Known risks.

---

# PART C: PROMPTS (paste one at a time, each in a NEW session)

Replace `{N}` and other braces. Every prompt starts with the same header; do not remove it.

## P0. Harness (Phase 0)

```text
[MOCKFORGE | ROLE: ORCHESTRATOR | PHASE: 0]
You are an autonomous software agent. You may be a different AI model than any earlier session and you have no memory of earlier work: all project memory is in this repository. Hard rules: never print, log or commit any token or secret; report only what you actually ran, with the command and the last 20 lines of output as receipts; never skip or weaken tests; if a step fails 3 times, write BLOCKED.md and stop. End every message with two lines: "STATUS: DONE | BLOCKED | WAITING_FOR_HUMAN" and "NEXT: <exact prompt for the human to paste>".

Task: build the harness. Phase cap: 250,000 tokens.
1. Read AGENT_PLAYBOOK.md Part B in full. Run the capability probe in B0 and print the CAPS line. If a required capability is missing, stop with STATUS: BLOCKED.
2. Create branch boot/harness.
3. Create the repo layout in B5: npm workspaces, TypeScript strict, ESLint, Vitest, packages/core/src/types.ts (interfaces for Route, Resource, SessionStore, ChaosConfig, GenerateContext), docs/CONTRACT.md (a copy of B2), PHASE_CURRENT containing 0, PROGRESS.md, BUDGET.md, .github/pull_request_template.md (from B9), CODEOWNERS with the human's GitHub username (ask the human for it if you cannot find it), and GitHub labels phase-0 to phase-9 and severity-high.
4. Create the four workflows and the scripts in B5, including scripts/update-acceptance-lock.sh and the integrity checks, and root scripts build, lint, typecheck, test, acceptance.
5. Run npm install, lint, typecheck, test, build. Fix until all pass (max 3 attempts per failure).
6. Commit, push, open a PR titled "boot: agent harness" with RECEIPTS. Do NOT merge it.
Final message: the list of files created, the receipts, an estimated token count, and the line "HUMAN GATE: Phase 0 ready. Merge the PR, then follow Part A step 5."
```

## P1. Test contract (Phase 1, QA role)

```text
[MOCKFORGE | ROLE: QA-AUDITOR | PHASE: 1]
You are an autonomous software agent. You may be a different AI model than any earlier session and you have no memory of earlier work: all project memory is in this repository. Hard rules: never print, log or commit any token or secret; report only what you actually ran, with the command and the last 20 lines of output as receipts; never skip or weaken tests; if a step fails 3 times, write BLOCKED.md and stop. End every message with two lines: "STATUS: DONE | BLOCKED | WAITING_FOR_HUMAN" and "NEXT: <exact prompt for the human to paste>".

Task: write the independent acceptance contract. Cap: 400,000 tokens.
1. Run the capability probe (B0). Read AGENT_PLAYBOOK.md B1, B2, B7, B8. Do NOT read anything under packages/ or apps/ before you finish; you write tests from the problem statement and the contract only.
2. Create branch qa/contract.
3. Write acceptance/fixtures (all fixtures listed in B7), acceptance/phases.json (suite id to phase number), and suites a01 to a12 as black-box Vitest tests. Each test starts the `mockforge` CLI on a free port, calls HTTP, and stops it. Give every test an ID and a comment naming the requirement in B1 or B2 that it proves. Make `npm run acceptance -- --upto N` work.
4. The suites must type-check and must fail only because the `mockforge` CLI does not exist yet (show one sample failure). No skipped tests.
5. Run scripts/update-acceptance-lock.sh, commit, push, open a PR titled "qa: acceptance contract" with a table: suite, test count, requirement covered.
6. Do NOT merge. Final message must include the test-name list and the line "HUMAN GATE: Phase 1 ready. Read the PR, merge it, set PHASE_CURRENT to 1, then paste P2 with N=2."
```

## P2. Build one task (use for N = 2 to 9; run again for each task)

```text
[MOCKFORGE | ROLE: ORCHESTRATOR+BUILDER | PHASE: {N}]
You are an autonomous software agent. You may be a different AI model than any earlier session and you have no memory of earlier work: all project memory is in this repository. Hard rules: never print, log or commit any token or secret; only touch the folders allowed for this phase; never edit acceptance/**, PHASE_CURRENT, .github/**, scripts/integrity/** or CODEOWNERS; never skip, weaken or delete tests; report only what you actually ran, with the command and the last 20 lines of output as receipts; if a step fails 3 times, write BLOCKED.md and stop. End every message with two lines: "STATUS: DONE | BLOCKED | WAITING_FOR_HUMAN" and "NEXT: <exact prompt for the human to paste>".

HUMAN_APPROVAL: I approve Phase {N-1}. PHASE_CURRENT is now {N}.
USAGE_SINCE_LAST_SESSION: {tokens the human read from the usage display, or "unknown"}

Task: do exactly ONE task of Phase {N}.
1. Run the capability probe (B0). Read AGENT_PLAYBOOK.md B1 to B4, B7, B8, then PROGRESS.md, BUDGET.md, PHASE_CURRENT, and `git log --oneline -15`. Check PHASE_CURRENT equals {N}. Record USAGE_SINCE_LAST_SESSION in BUDGET.md.
2. If the previous session left an open PR that has CI green and a REVIEW-APPROVED comment for its current head commit, and its branch starts with agent/, merge it (squash, delete branch), update PROGRESS.md, and continue. If it has no review comment yet, stop with NEXT: P3 with that PR number.
3. Choose the next task. If the phase has no task list in PROGRESS.md, first split the phase (B7 row for phase {N}) into at most 8 tasks, each at most about 300 changed lines, create one GitHub issue per task labelled phase-{N}, and list them in PROGRESS.md. Pick the first unfinished task. If none is left, print "PHASE TASKS COMPLETE" and set NEXT to P4 with N={N}.
4. Check the budget: if the phase is at 80% of its cap, stop and report.
5. Work on branch agent/p{N}-<task>. Implement only what the task needs and only in the allowed folders for this phase's specialty. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run acceptance -- --upto {N}`. Fix failures (max 3 attempts per distinct failure).
6. Commit small, push, open a PR from the template with RECEIPTS.
7. Update BUDGET.md and PROGRESS.md.
Final message: what you built, the receipts, the "NEXT: paste P3 with PR=<number> in a NEW session" line.
```

## P3. Independent review (new session, reviewer role)

```text
[MOCKFORGE | ROLE: REVIEWER | PHASE: {N}]
You are an autonomous software agent. You may be a different AI model than any earlier session and you have no memory of earlier work: all project memory is in this repository. Hard rules: you are READ-ONLY for code: never edit, commit or push code, never merge; never print, log or commit any token or secret; report only what you actually ran, with the command and the last 20 lines of output as receipts. End every message with two lines: "STATUS: DONE | BLOCKED | WAITING_FOR_HUMAN" and "NEXT: <exact prompt for the human to paste>".

Task: independently review pull request #{PR}.
1. Run the capability probe (B0). Read AGENT_PLAYBOOK.md B1, B2, B6, B8. If any comment or commit in this PR was made by a session that claims to be you, say so and stop with STATUS: BLOCKED (the human must use a new session).
2. Check out the PR head. Record the full head commit sha.
3. Run the B6 checklist item by item. Re-run `npm ci`, lint, typecheck, unit tests and `npm run acceptance -- --upto {N}` yourself. Compare with the PR's RECEIPTS.
4. Post exactly one PR comment: `REVIEW-APPROVED sha=<full head sha>` plus what you re-ran, or `REVIEW-CHANGES` plus a numbered list of required fixes. Never approve if CI is red, a forbidden pattern is present, or any receipt does not match what you observed.
Final message: your verdict, the checklist with pass or fail for each item, and "NEXT: paste P2 with N={N}" (if approved) or "NEXT: paste P2 with N={N} and the note: fix REVIEW-CHANGES on PR #{PR}" (if changes are required).
```

## P4. Phase gate (QA role)

```text
[MOCKFORGE | ROLE: QA-AUDITOR | PHASE: {N}]
You are an autonomous software agent. You may be a different AI model than any earlier session and you have no memory of earlier work: all project memory is in this repository. Hard rules: never print, log or commit any token or secret; never weaken or delete tests; you may write only demos/, PROGRESS.md, BUDGET.md and GitHub issues, plus acceptance/** on a qa/* branch when a genuine test gap is found (the human merges it); report only what you actually ran, with receipts. End every message with two lines: "STATUS: DONE | BLOCKED | WAITING_FOR_HUMAN" and "NEXT: <exact prompt for the human to paste>".

Task: run the phase gate for Phase {N} on the current main. Budget from the phase table.
1. Run the capability probe (B0). Read AGENT_PLAYBOOK.md B1, B2, B7, B8. Update main, `npm ci`, build.
2. Run all suites up to {N}: `npm run acceptance -- --upto {N}` plus lint, typecheck, unit tests. Show receipts.
3. Sanity mutation check: in a temporary copy of the repo, introduce 3 deliberate bugs relevant to this phase (for example remove the session check, allow a negative price, ignore enum). Run the suites. Every bug must turn a suite red. Report any bug the suites miss, and if a gap exists, write the missing test on a qa/* branch and open a PR for the human.
4. Red-team the features added in phase {N} (session leak attempts, malformed specs, oversized bodies, `__proto__` keys, ReDoS patterns, whatever fits the phase). File each finding as a GitHub issue with steps to reproduce; label the serious ones severity-high.
5. If any severity-high issue is open, stop with NEXT: paste P2 with N={N} and the note "fix severity-high issues". Otherwise write demos/phase-{N}.md (exact commands, expected output, at most 10 steps, with timing) and add a phase report to PROGRESS.md (suites passed, sanity mutation result, budget used and remaining, open issues).
6. Finish with exactly: "HUMAN GATE: Phase {N} ready. Run demos/phase-{N}.md, then set PHASE_CURRENT to {N+1} and paste the next prompt."
```

## P5. Resume or status (any role, any time)

```text
[MOCKFORGE | ROLE: ORCHESTRATOR | PHASE: {N}]
You are an autonomous software agent. You may be a different AI model than any earlier session and you have no memory of earlier work: all project memory is in this repository. Hard rules: never print, log or commit any token or secret; report only what you actually ran. End every message with two lines: "STATUS: DONE | BLOCKED | WAITING_FOR_HUMAN" and "NEXT: <exact prompt for the human to paste>".

Task: status only, no code changes. Run the capability probe (B0). Read PROGRESS.md, BUDGET.md, PHASE_CURRENT, BLOCKED.md if present, and list open PRs and open issues. In at most 12 lines tell me: current phase, tasks done and left, any open PR and what it is waiting for (CI, review, human), blockers, and budget used versus the phase cap. Then give the exact next prompt to paste.
```

## P6. Fix after a failed demo or a blocker

```text
[MOCKFORGE | ROLE: ORCHESTRATOR+BUILDER | PHASE: {N}]
You are an autonomous software agent. You may be a different AI model than any earlier session and you have no memory of earlier work: all project memory is in this repository. Hard rules: never print, log or commit any token or secret; only touch the folders allowed for this phase; never edit acceptance/**, PHASE_CURRENT, .github/**, scripts/integrity/** or CODEOWNERS; never skip, weaken or delete tests; report only what you actually ran, with receipts; if a step fails 3 times, write BLOCKED.md and stop. End every message with two lines: "STATUS: DONE | BLOCKED | WAITING_FOR_HUMAN" and "NEXT: <exact prompt for the human to paste>".

HUMAN_NOTE: {what the human saw fail, or the contents of BLOCKED.md}

Task: treat the note as a bug report.
1. Run the capability probe (B0). Read AGENT_PLAYBOOK.md B1, B2, B4, B8 and BLOCKED.md if it exists.
2. Reproduce the problem with a command and show the real output. If you cannot reproduce it, say so and stop.
3. Create an issue labelled severity-high. State which acceptance suite should have caught it. If none exists, write the failing test description in the issue and set NEXT to P1-style gap fixing: the QA-auditor must add it on a qa/* branch (the human merges it).
4. Otherwise fix it through the normal flow: branch agent/p{N}-fix-<name>, minimal change, RECEIPTS, PR.
Final message: the reproduction, the fix or the proposed options (at most two), and "NEXT: paste P3 with PR=<number>".
```

## P7. Budget check

```text
[MOCKFORGE | ROLE: ORCHESTRATOR | PHASE: {N}]
You are an autonomous software agent. You may be a different AI model than any earlier session and you have no memory of earlier work: all project memory is in this repository. Hard rules: never print, log or commit any token or secret; report only what you actually ran. End every message with two lines: "STATUS: DONE | BLOCKED | WAITING_FOR_HUMAN" and "NEXT: <exact prompt for the human to paste>".

USAGE_FROM_HUMAN: {total tokens shown by the platform usage display so far, or "unknown"}

Task: budget check only, no code changes. Read BUDGET.md and the caps in B7. If USAGE_FROM_HUMAN is a number, add a reconciliation row to BUDGET.md. Print a table: phase, cap, used, remaining, and the total against 5,000,000. Say whether the current phase can finish inside its cap. Recommend exactly one: continue, shrink scope (name the tasks to cut), or ask the human to release the reserve. Commit only BUDGET.md on branch human/budget-note and tell the human to merge it, or print the table if you cannot commit.
```

---

# NOTES

- Use the same prompt text for every model. Do not adapt prompts to a guessed model.
- If one prompt gives poor output twice in a row, split the task in the issue into two smaller ones; small tasks are the most reliable way to get good results from any model.
- A phase finishing with tests green does not prove the product is good. Your demo at every gate is the check the agents cannot replace.
