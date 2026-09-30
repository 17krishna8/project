# Demos

Two scripted demos. Each one prints the command it runs and the response it got,
so the transcript is evidence rather than a claim.

```bash
./demos/demo.sh          # boot -> CRUD -> validation -> isolation -> chaos -> SSE log
./demos/spec-swap.sh     # hot reload: edit the spec, the mock follows
```

Both need `npm install && npm run build` first, and both clean up after
themselves (the server is killed and the temp files removed on exit).

| | |
|---|---|
| `PORT` | the port to use — default `3300` for `demo.sh`, `3301` for `spec-swap.sh` |
| first argument | the spec to boot — `demo.sh` accepts any path, default `samples/tasks.yaml` |

```bash
PORT=4000 ./demos/demo.sh samples/orders.json
```

---

## `demo.sh` — the full tour

Ten steps, roughly 30 seconds:

| # | Step | What it proves |
|---|---|---|
| 1 | boot from a spec | one command, sub-second boot, printed startup summary |
| 2 | `/__health` | routes, sessions, uptime, boot time |
| 3 | `/__admin/routes` | the routes the spec produced, with their kind |
| 4 | semantic data | Indian mobiles, ISO-8601 timestamps, enums, two-decimal money |
| 5 | CRUD | `201` -> read -> `PATCH` -> `204` -> `404` for an unknown id |
| 6 | validation | a body that breaks the spec gets a `400` naming the path |
| 7 | session isolation | two session ids, two independent datasets |
| 8 | chaos | `X-Mock-Status`, `X-Mock-Latency`, and 100% error rate live |
| 9 | the SSE log | `GET /__admin/logs`, streamed |
| 10 | the dashboard | where to open `/__ui` |

## `spec-swap.sh` — hot reload

Boots with `--watch` against a generated Widgets API, rewrites the file on disk
into a Gadgets API, and shows the mock following along: new routes, new data, and
the old paths answering `404`. Sessions survive the swap.

---

## Presenting it

- Run `demo.sh` in a terminal wide enough for the JSON to stay on one line.
- Step 4 and step 8 are the two worth slowing down on: they are the parts a
  handwritten mock server gets wrong.
- The dashboard is best shown in a browser *while* `demo.sh` is running — the SSE
  log stream updates live as the script drives traffic.
- For a recorded run, pipe through `tee`:

```bash
./demos/demo.sh 2>&1 | tee demo-transcript.txt
```
