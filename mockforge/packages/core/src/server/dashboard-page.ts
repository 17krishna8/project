/**
 * The no-build dashboard.
 *
 * The React app in `apps/dashboard` is the primary UI, but it only exists once
 * somebody has run a build. `/__ui` must never be a dead end, so when no built
 * bundle is present the server serves this page instead: a single self-contained
 * HTML document that talks to the same admin endpoints the React app uses.
 *
 * Everything here is plain DOM and fetch - no framework, no asset pipeline, so
 * it works from the compiled package alone.
 */

export function renderDashboardPage(spec: { title: string; version: string; routes: number; mode: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="mockforge-mode" content="${escapeAttribute(spec.mode)}" />
<title>MockForge Dashboard</title>
<script>window.__MOCKFORGE_SPEC__ = ${JSON.stringify({
    title: spec.title,
    version: spec.version,
    routes: spec.routes
  })};</script>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #020617; color: #e2e8f0; font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between;
           padding: 16px 24px; border-bottom: 1px solid #1e293b; background: rgba(15,23,42,.7); }
  h1 { font-size: 17px; margin: 0; letter-spacing: -.01em; }
  h2 { font-size: 13px; margin: 0 0 10px; color: #cbd5e1; }
  .sub { font-size: 12px; color: #64748b; margin: 2px 0 0; }
  .badge { border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 500; }
  .ok { background: rgba(16,185,129,.15); color: #6ee7b7; }
  .bad { background: rgba(244,63,94,.15); color: #fda4af; }
  .dim { background: #1e293b; color: #cbd5e1; }
  main { max-width: 1200px; margin: 0 auto; padding: 24px; display: grid; gap: 20px; }
  .cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
  .card { border: 1px solid #1e293b; border-radius: 12px; padding: 14px; background: rgba(15,23,42,.6); }
  .card .k { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; }
  .card .v { font-size: 22px; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .panel { border: 1px solid #1e293b; border-radius: 12px; padding: 16px; background: rgba(15,23,42,.6); }
  .cols { display: grid; gap: 20px; grid-template-columns: 2fr 1fr; }
  @media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
       color: #64748b; font-weight: 500; padding: 6px 8px; }
  td { padding: 6px 8px; border-top: 1px solid rgba(30,41,59,.7); }
  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .m { display: inline-block; border-radius: 6px; padding: 1px 7px; font-size: 11px; font-weight: 600; border: 1px solid; }
  .get { background: rgba(14,165,233,.15); color: #7dd3fc; border-color: rgba(14,165,233,.3); }
  .post { background: rgba(16,185,129,.15); color: #6ee7b7; border-color: rgba(16,185,129,.3); }
  .put, .patch { background: rgba(245,158,11,.15); color: #fcd34d; border-color: rgba(245,158,11,.3); }
  .delete { background: rgba(244,63,94,.15); color: #fda4af; border-color: rgba(244,63,94,.3); }
  .scroll { max-height: 320px; overflow: auto; }
  label { display: block; font-size: 13px; color: #cbd5e1; margin-top: 12px; }
  label span { float: right; font-family: ui-monospace, monospace; font-size: 12px; color: #94a3b8; }
  input[type=range] { width: 100%; accent-color: #6366f1; margin-top: 6px; }
  button { border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0;
           padding: 6px 12px; font-size: 13px; cursor: pointer; }
  button.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
  button:hover { filter: brightness(1.15); }
  .row { display: flex; gap: 8px; align-items: center; margin-top: 14px; flex-wrap: wrap; }
  .note { font-size: 12px; color: #64748b; }
  .s2xx { color: #6ee7b7; } .s4xx { color: #fcd34d; } .s5xx { color: #fda4af; }
  .fault { color: #fda4af; }
  ul.sessions { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow: auto; }
  ul.sessions li { display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px;
                   border-radius: 8px; font-size: 12px; cursor: pointer; }
  ul.sessions li:hover { background: rgba(30,41,59,.6); }
  pre { margin: 10px 0 0; padding: 10px; border-radius: 8px; background: #020617; border: 1px solid #1e293b;
        font-size: 11px; max-height: 200px; overflow: auto; color: #cbd5e1; }
  .modal-bg { position: fixed; inset: 0; background: rgba(2,6,23,.8); backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
  .modal { background: #0f172a; border: 1px solid #334155; border-radius: 16px; width: 100%; max-width: 600px; padding: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,.7); }
  .dropzone { border: 2px dashed #475569; border-radius: 12px; padding: 20px; text-align: center; cursor: pointer; transition: all .2s; }
  .dropzone:hover { border-color: #6366f1; background: rgba(99,102,241,.06); }
  .dropzone.dragover { border-color: #6366f1; background: rgba(99,102,241,.15); }
  footer { max-width: 1200px; margin: 0 auto; padding: 0 24px 32px; font-size: 12px; color: #475569; }
</style>
</head>
<body>
<div id="upload-modal" class="modal-bg">
  <div class="modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h2 style="margin:0;font-size:16px;color:#f8fafc">Upload / Switch Spec</h2>
      <button id="close-modal" style="padding:2px 8px;font-size:14px">✕</button>
    </div>
    <p class="note" style="margin:0 0 16px">Upload an OpenAPI (3.x) or Swagger (2.0) YAML/JSON file, or choose from sample specs.</p>
    
    <div class="dropzone" id="dropzone">
      <p style="margin:0;font-weight:500;color:#cbd5e1">Drag & drop .yaml or .json file here</p>
      <p class="note" style="margin:4px 0 12px">or click to browse files</p>
      <input type="file" id="spec-file-input" accept=".yaml,.yml,.json" style="display:none" />
      <button class="primary" id="btn-browse" type="button">Browse Files</button>
    </div>
    
    <div style="margin-top:16px">
      <label style="margin:0 0 8px 0;font-weight:600;font-size:12px;color:#94a3b8">Switch to a sample spec:</label>
      <div id="sample-buttons" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"></div>
    </div>

    <div style="margin-top:16px">
      <label style="margin:0 0 8px 0;font-weight:600;font-size:12px;color:#94a3b8">Or paste YAML / JSON:</label>
      <textarea id="spec-paste" rows="4" style="width:100%;box-sizing:border-box;background:#020617;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-family:monospace;font-size:11px;padding:8px" placeholder="openapi: 3.0.3&#10;..."></textarea>
      <div style="margin-top:6px">
        <button class="primary" id="btn-load-pasted" type="button">Load Pasted Spec</button>
      </div>
    </div>

    <div id="upload-status" style="margin-top:12px;font-size:12px;display:none;padding:8px 12px;border-radius:8px"></div>
  </div>
</div>

<header>
  <div>
    <h1>MockForge Dashboard</h1>
    <p class="sub" id="spec"></p>
  </div>
  <div style="display:flex;gap:10px;align-items:center">
    <button class="primary" id="btn-upload" style="background:#4f46e5;font-weight:600">📤 Upload / Switch Spec</button>
    <span class="badge bad" id="health">checking</span>
    <span class="badge dim" id="mode"></span>
  </div>
</header>

<main>
  <div id="root"></div>
  <section class="cards">
    <div class="card"><div class="k">Routes</div><div class="v" id="c-routes">-</div></div>
    <div class="card"><div class="k">Sessions</div><div class="v" id="c-sessions">-</div></div>
    <div class="card"><div class="k">Uptime</div><div class="v" id="c-uptime">-</div></div>
    <div class="card"><div class="k">Requests logged</div><div class="v" id="c-logs">0</div></div>
  </section>

  <div class="cols">
    <div style="display:grid;gap:20px">
      <section class="panel">
        <h2>Routes</h2>
        <div class="scroll">
          <table><thead><tr><th>Method</th><th>Path</th><th>Kind</th><th>Resource</th></tr></thead>
          <tbody id="routes"></tbody></table>
        </div>
      </section>

      <section class="panel">
        <h2>Live request log <span class="note" id="stream-state"></span></h2>
        <div class="scroll">
          <table><thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>Latency</th><th>Session</th><th>Fault</th></tr></thead>
          <tbody id="logs"></tbody></table>
        </div>
      </section>
    </div>

    <div style="display:grid;gap:20px;align-content:start">
      <section class="panel">
        <h2>Chaos injection</h2>
        <p class="note">Reserved paths are never faulted.</p>
        <label>Latency <span id="v-lat">0 ms</span>
          <input type="range" id="i-lat" min="0" max="3000" step="50" value="0" /></label>
        <label>Error rate <span id="v-err">0%</span>
          <input type="range" id="i-err" min="0" max="1" step="0.01" value="0" /></label>
        <label>404 share <span id="v-split">50%</span>
          <input type="range" id="i-split" min="0" max="100" step="5" value="50" /></label>
        <div class="row">
          <button class="primary" id="apply">Apply</button>
          <button id="reset">Reset</button>
          <span class="note" id="chaos-note"></span>
        </div>
      </section>

      <section class="panel">
        <h2>Sessions <button id="reset-sessions" style="float:right">Reset all</button></h2>
        <ul class="sessions" id="sessions"></ul>
        <pre id="session-data" hidden></pre>
      </section>
    </div>
  </div>
</main>

<footer>MockForge - a spec-driven mock REST server. This page is the no-build dashboard; run
<code>npm run build</code> to serve the React dashboard instead.</footer>

<script>
const SPEC = window.__MOCKFORGE_SPEC__ || { title: "MockForge", version: "0.0.0", routes: 0 };
document.getElementById("spec").textContent = SPEC.title + " v" + SPEC.version;
document.getElementById("mode").textContent =
  document.querySelector('meta[name="mockforge-mode"]').content + " mode";

const $ = (id) => document.getElementById(id);
const fmtDuration = (ms) => ms < 1000 ? ms + " ms"
  : ms < 60000 ? (ms / 1000).toFixed(1) + " s"
  : Math.floor(ms / 60000) + "m " + Math.round((ms % 60000) / 1000) + "s";

async function get(path) {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(path + " -> " + res.status);
  return res.json();
}

async function refreshHealth() {
  try {
    const health = await get("/__health");
    $("c-routes").textContent = health.routes;
    $("c-sessions").textContent = health.sessions;
    $("c-uptime").textContent = fmtDuration(health.uptimeMs);
    const badge = $("health");
    badge.textContent = health.status === "ok" ? "healthy" : health.status;
    badge.className = "badge " + (health.status === "ok" ? "ok" : "bad");
  } catch {
    const badge = $("health");
    badge.textContent = "unreachable";
    badge.className = "badge bad";
  }
}

async function refreshRoutes() {
  const routes = await get("/__admin/routes");
  $("routes").innerHTML = routes.map((r) =>
    "<tr><td><span class=\\"m " + r.method.toLowerCase() + "\\">" + r.method + "</span></td>" +
    "<td class=\\"mono\\">" + r.path + "</td><td>" + r.kind + "</td><td>" + (r.resource || "-") + "</td></tr>"
  ).join("");
}

let sessions = [];
async function refreshSessions() {
  sessions = await get("/__admin/sessions");
  $("sessions").innerHTML = sessions.map((s) =>
    "<li data-id=\\"" + s.id + "\\"><span class=\\"mono\\">" + s.id + "</span>" +
    "<span class=\\"note\\">" + s.records + " records</span></li>"
  ).join("") || "<li class=\\"note\\">No active sessions.</li>";
}

$("sessions").addEventListener("click", async (event) => {
  const id = event.target.closest("li")?.dataset?.id;
  if (!id) return;
  try {
    const data = await get("/__admin/sessions/" + encodeURIComponent(id) + "/data");
    const pre = $("session-data");
    pre.hidden = false;
    pre.textContent = JSON.stringify(data, null, 2).slice(0, 4000);
  } catch { /* the session may have expired */ }
});

$("reset-sessions").addEventListener("click", async () => {
  await fetch("/__admin/sessions", { method: "DELETE" });
  $("session-data").hidden = true;
  refreshSessions();
});

// --- chaos ---------------------------------------------------------------
const sliders = [["i-lat", "v-lat", (v) => v + " ms"], ["i-err", "v-err", (v) => Math.round(v * 100) + "%"],
                 ["i-split", "v-split", (v) => v + "%"]];
function readSliders() {
  return { latencyMs: Number($("i-lat").value), errorRate: Number($("i-err").value),
           split404: Number($("i-split").value) };
}
sliders.forEach(([input, out, format]) => {
  const sync = () => { $(out).textContent = format(Number($(input).value)); };
  $(input).addEventListener("input", sync);
  sync();
});

$("apply").addEventListener("click", async () => {
  $("chaos-note").textContent = "Applying...";
  try {
    const res = await fetch("/__admin/chaos", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(readSliders())
    });
    if (!res.ok) throw new Error(String(res.status));
    $("chaos-note").textContent = "Applied.";
  } catch {
    $("chaos-note").textContent = "Rejected.";
  }
});

$("reset").addEventListener("click", () => {
  $("i-lat").value = 0; $("i-err").value = 0; $("i-split").value = 50;
  sliders.forEach(([input, out, format]) => { $(out).textContent = format(Number($(input).value)); });
});

(async () => {
  try {
    const chaos = await get("/__admin/chaos");
    $("i-lat").value = chaos.latencyMs; $("i-err").value = chaos.errorRate; $("i-split").value = chaos.split404;
    sliders.forEach(([input, out, format]) => { $(out).textContent = format(Number($(input).value)); });
  } catch { /* defaults are fine */ }
})();

// --- live log ------------------------------------------------------------
const source = new EventSource("/__admin/logs");
let logged = 0;
source.onopen = () => { $("stream-state").textContent = "streaming"; };
source.onerror = () => { $("stream-state").textContent = "reconnecting..."; };
source.onmessage = (message) => {
  let event;
  try { event = JSON.parse(message.data); } catch { return; }
  logged += 1;
  $("c-logs").textContent = logged;
  const row = document.createElement("tr");
  const tone = event.status >= 500 ? "s5xx" : event.status >= 400 ? "s4xx" : "s2xx";
  row.innerHTML =
    "<td class=\\"note\\">" + event.time.slice(11, 19) + "</td>" +
    "<td>" + event.method + "</td>" +
    "<td class=\\"mono\\">" + event.path + "</td>" +
    "<td class=\\"" + tone + "\\">" + event.status + "</td>" +
    "<td class=\\"note\\">" + event.latencyMs + " ms</td>" +
    "<td class=\\"note\\">" + event.session.slice(0, 16) + "</td>" +
    "<td class=\\"fault\\">" + (event.fault || "") + "</td>";
  const body = $("logs");
  body.prepend(row);
  while (body.children.length > 200) body.lastChild.remove();
};

// --- upload & spec switcher ----------------------------------------------
function setUploadStatus(msg, isError) {
  const el = $("upload-status");
  el.style.display = "block";
  el.textContent = msg;
  el.style.background = isError ? "rgba(244,63,94,.15)" : "rgba(16,185,129,.15)";
  el.style.color = isError ? "#fda4af" : "#6ee7b7";
  el.style.border = "1px solid " + (isError ? "rgba(244,63,94,.3)" : "rgba(16,185,129,.3)");
}

async function uploadSpecContent(specContent, filename) {
  setUploadStatus("Validating and generating routes...", false);
  try {
    const res = await fetch("/__admin/spec", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: specContent, filename })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Upload failed: " + res.status);
    setUploadStatus("Loaded " + data.title + " v" + data.version + " (" + data.routes + " routes)", false);
    $("spec").textContent = data.title + " v" + data.version;
    refreshHealth();
    refreshRoutes();
    refreshSessions();
    setTimeout(() => { $("upload-modal").style.display = "none"; }, 1500);
  } catch (err) {
    setUploadStatus(err.message || String(err), true);
  }
}

async function loadSample(sampleName) {
  setUploadStatus("Loading sample " + sampleName + "...", false);
  try {
    const res = await fetch("/__admin/spec", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sample: sampleName })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Sample load failed: " + res.status);
    setUploadStatus("Loaded " + data.title + " (" + data.routes + " routes)", false);
    $("spec").textContent = data.title + " v" + data.version;
    refreshHealth();
    refreshRoutes();
    refreshSessions();
    setTimeout(() => { $("upload-modal").style.display = "none"; }, 1200);
  } catch (err) {
    setUploadStatus(err.message || String(err), true);
  }
}

async function loadSamples() {
  try {
    const list = await get("/__admin/samples");
    const container = $("sample-buttons");
    container.innerHTML = "";
    list.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dim";
      btn.textContent = s.title + " (" + s.routesCount + " routes)";
      btn.addEventListener("click", () => loadSample(s.filename));
      container.appendChild(btn);
    });
  } catch { /* ignore */ }
}

$("btn-upload").addEventListener("click", () => {
  $("upload-modal").style.display = "flex";
  loadSamples();
});
$("close-modal").addEventListener("click", () => { $("upload-modal").style.display = "none"; });
$("upload-modal").addEventListener("click", (e) => {
  if (e.target === $("upload-modal")) $("upload-modal").style.display = "none";
});

$("btn-browse").addEventListener("click", () => $("spec-file-input").click());
$("spec-file-input").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => uploadSpecContent(reader.result, file.name);
  reader.readAsText(file);
});

const dz = $("dropzone");
dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dragover"); });
dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
dz.addEventListener("drop", (e) => {
  e.preventDefault();
  dz.classList.remove("dragover");
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => uploadSpecContent(reader.result, file.name);
  reader.readAsText(file);
});

$("btn-load-pasted").addEventListener("click", () => {
  const text = $("spec-paste").value.trim();
  if (!text) { setUploadStatus("Please paste a YAML or JSON spec first.", true); return; }
  uploadSpecContent(text, "pasted-spec.yaml");
});

refreshHealth(); refreshRoutes(); refreshSessions();
setInterval(refreshHealth, 2000);
setInterval(refreshSessions, 4000);
</script>
</body>
</html>`;
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char
  );
}
