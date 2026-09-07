# Sentinel — AI-Powered Cybersecurity Agent

Email threat detection, geolocation tracing, forensic analysis, and
blockchain-verified evidence logging — all **local**, all **terminal-based**,
no web dashboard, no browser UI.

Sentinel investigates ONE `.eml` at a time using a **local LLM (Ollama)** as
the reasoning brain, a **tool-whitelisted** Python agent controller, a
**Docker sandbox** for static file analysis, and a **hash-chained blockchain
ledger** for tamper-proof evidence. It solves the classic
**Gmail/webmail-hides-sender-IP** problem with honest, confidence-scored
fallback logic instead of fake pins.

---

## Architecture

```
[LOCAL LLM — Ollama, tool-calling]     "reasoning brain"
        │  THINK → CHOOSE TOOL → ACT → OBSERVE
        ▼
[AGENT CONTROLLER — sentinel/agent.py]
   • rich live terminal UI (colored risk, streaming reasoning)
   • running risk score (0-100) after every tool call
   • human confirmation gate + keypress kill-switch
        │
        ▼
[TOOL LAYER — whitelisted Python only, no shell exec]
   parse_headers · resolve_origin · geolocate_ip · check_tor_exit
   extract_urls · check_reputation · static_file_scan · hash_evidence
        │  (only static_file_scan touches file bytes)
        ▼
[SANDBOX — Docker, --network none, read-only mount, destroyed per run]
        │
        ▼
[BLOCKCHAIN LEDGER — hash-chain (default) or Ganache]
   logs ONLY {file_hash, verdict, confidence, timestamp, geo_summary}
```

---

## Quick start

```bash
bash setup.sh                       # venv + deps (+ optional sandbox/Ollama)
source .venv/bin/activate

# Full investigation (LLM-driven; falls back to deterministic if Ollama offline)
python run.py samples/phishing.eml

# Deterministic pipeline (no Ollama needed)
python run.py samples/bec_gmail.eml --no-llm

# Verify the evidence ledger integrity
python run.py --verify-chain
```

Sample emails in `samples/`:
- `clean.eml` — legitimate internal mail (SAFE)
- `phishing.eml` — brand-impersonating phish with a real, traceable sender IP
- `bec_gmail.eml` — subtle BEC sent via **Gmail webmail** (demonstrates the
  IP-unrecoverable fallback logic: `209.85.x.x` is a Google relay, so the
  agent honestly reports "origin unrecoverable" and lowers confidence)
- `malware_attachment.eml` — attachment that's an ELF binary disguised as a PDF

## Forensic tools (real Parrot OS / REMnux binaries)

Beyond the built-in Python tools, the agent can call **7 sandboxed forensic
binaries** — the same class of tools you'd run on Parrot OS or REMnux, but
pinned inside the network-isolated Docker sandbox so nothing touches the host:

| Tool | Binary | What it finds |
|---|---|---|
| `static_file_scan` | `exiftool` + `oletools` | metadata, macros, entropy, type mismatch |
| `binwalk_scan` | `binwalk` | embedded/concatenated files (file carving) |
| `pdfid_scan` | `pdfid` | PDF exploits (JS, OpenAction, Launch) |
| `capa_scan` | `capa` (FLARE) | what malware can *do* (ATT&CK techniques) |
| `strings_scan` | `strings` | URLs/IPs/shell commands in the binary |
| `yara_scan` | `yara` | signature matches (rules in `sandbox/yara_rules/`) |
| `pecheck_scan` | `pecheck` | PE structural anomalies |

Plus two host-side intel tools for **phishing-infrastructure tracing**:
`dns_lookup` (A/MX/TXT-SPF/NS) and `whois_lookup` (registrar, age,
privacy-protection) — both read-only public lookups.

All 7 forensic tools are **file-touching** → the agent requires a human
`yes` before running them, and they execute only inside the sandbox.

---

## Configuration

Copy `.env.example` → `.env` and fill in what you need. Everything has a safe
local default; the only *optional* cloud bits are free-tier reputation APIs:

| Variable | Purpose |
|---|---|
| `OLLAMA_MODEL` | local model (`llama3.1:8b`, `qwen2.5:7b`) |
| `VIRUSTOTAL_API_KEY` | VT file/domain/IP reputation |
| `ABUSEIPDB_API_KEY` | IP abuse confidence |
| `MAXMIND_GEOLITE2_PATH` | offline GeoIP cross-validation |
| `BLOCKCHAIN_MODE` | `hashchain` (default) or `ganache` |

---

## Safety measures (all enforced in code)

1. **Tool whitelist** — the LLM only *names* tools; `sentinel/tools/registry.py`
   maps names to code. No `eval`/`exec`/shell.
2. **Sandbox isolation** — `static_file_scan` runs in a one-shot container
   with `--network none`, `--read-only`, `--cap-drop ALL`, non-root, destroyed
   after each run.
3. **Static analysis only** — metadata/entropy/magic/macro *parsing*; the file
   is **never** executed or opened in the host.
4. **Confirmation gate** — file-touching tools emit `[CONFIRM_NEEDED]` and wait
   for a human `yes`.
5. **Hard timeout** — every tool call is capped (`TOOL_TIMEOUT_SECONDS`, 15s).
6. **Immutable evidence** — SHA-256 *before* analysis, appended to a
   hash-linked ledger; `--verify-chain` proves nothing changed.
7. **Prompt-injection defense** — email content lives inside `<EMAIL_DATA>`
   tags; the system prompt forbids obeying anything inside them.
8. **Kill-switch** — press `q` / `x` / `ESC` (or Ctrl+C) to abort instantly.

---

## The desktop mascot (optional bonus UI)

The one *desktop* (non-terminal) element is a small animated "guard"
character that sits at the corner of your **Gmail** window and reacts to the
live risk score — green/calm → yellow/alert → red/alarm. It **only covers the
Gmail window's corner**, and it **never reads your screen, keystrokes, or
browser content**.

```bash
pip install PySide6                      # (optional)
python overlay/run_overlay.py --follow \
       --risk-file /tmp/sentinel_risk.json
```

The agent publishes `{'risk': n}` to `/tmp/sentinel_risk.json` on every risk
update; the mascot polls it and animates accordingly. On Linux/X11 it uses
`xdotool` to find the Gmail window and snap to it; on other platforms it runs
as a free-floating overlay.

## The desktop pet (Sentinel Pet)

A Comnyang-style **pixel-art guard** that lives **static** on your desktop
(pinned to your Gmail window corner by default — it never wanders, only its
face animates). It mirrors the agent's live state **and** adds chat, mail
display, analysis, and notifications.

```bash
pip install PySide6
python -m overlay.sentinel_pet --demo         # cycle all expressions
python -m overlay.sentinel_pet --mail mailpit # static pet + mail panel
python -m overlay.sentinel_pet --x 1200 --y 700   # pin to a fixed spot
```

**Expressions** (change by state/risk): `idle` (smile) → `investigating`
(shield) → `thinking` (… bubble, eyes up) → `tool_running` (focused) →
`confirm_needed` (! bubble) → `verdict` (green happy hop / red alarm+shake),
plus `talking`, `sleepy` (zzz), `celebrate` (★), `confused` (?). Body color
tracks the live risk score (green→yellow→orange→red).

**Chat:** click the pet → type a message → it answers via your **local Ollama**
in a speech bubble (falls back gracefully if Ollama is offline).

**Mail panel + notifications:** `--mail mailpit` opens a side panel listing
emails; select one and click **Analyze** to run the full forensics pipeline,
then the pet fires an OS notification with the verdict.

### Where the mail comes from (self-hosted, open-source)

For local demo/testing — no real Gmail needed — the recommended backend is
**Mailpit** (MIT-licensed, single Go binary, the modern MailHog successor):

```bash
docker compose up -d                    # starts Mailpit (UI+API:8025, SMTP:1025)
python -m overlay.seed_mailpit           # sends samples/*.eml into it
python -m overlay.sentinel_pet --mail mailpit
```

Other backends in `sentinel/mail.py`:
- `--mail screen` — OCR the currently-visible Gmail window (needs `xdotool`
  + ImageMagick `import` + `tesseract`). Honest about its limits.
- `--mail gmail-oauth` — **stub** for a read-only Gmail API (OAuth), to add later.

**Privacy:** all backends are read-only; the pet never records keystrokes or
reads the screen beyond the one explicit OCR action you trigger. Chat + mail
stay on your machine (Ollama is local).

---

## Project layout

```
run.py                     entry point
sentinel/
  main.py                  CLI + evidence logging + report wiring
  agent.py                 reasoning loop + safety gates
  llm.py                   Ollama tool-calling client
  prompt.py                system prompt + injection defense
  killswitch.py            keypress abort + cleanup hooks
  risk.py                  running score tracker (+ mascot hook)
  ui.py                    rich live terminal dashboard
  sandbox.py               Docker isolation backend
  report.py                forensic report writer
  tools/                   the whitelisted tool functions
  blockchain/              hashchain + ganache backends
sandbox/Dockerfile         static-analysis image
docker-compose.yml         Mailpit (self-hosted demo inbox)
overlay/static_scan.py     runs INSIDE sandbox (read-only)
overlay/sentinel_pet.py    static pixel pet (expressions/chat/mail/notify)
overlay/sprites.py         pet sprite data (Qt-free, unit-testable)
overlay/preview.py         render PNG previews of every pet state
overlay/seed_mailpit.py    seed the demo inbox with sample emails
samples/*.eml              clean / phishing / BEC(Gmail) / malware test cases
```

## Running a full local demo (no cloud)

```bash
source .venv/bin/activate
python run.py samples/phishing.eml        # LLM + tools
python run.py samples/bec_gmail.eml --no-llm
python run.py --verify-chain
```
