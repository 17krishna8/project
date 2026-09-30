/**
 * MockForge Real Frontend Client - Dynamic OpenAPI Spec Engine & Live Visualizations
 */

const API_BASE = "http://127.0.0.1:3000";
const REAL_BACKEND_URL = "http://127.0.0.1:8080";
const MOCK_TARGET_BACKEND_URL = "http://real-production-backend:8080";
const SESSION_ID = "session-prod-dev";

// Global State
let activeSpecId = "tasks";
let activeSpecDetails = null;
let registeredRoutes = [];
let activeResource = "tasks";
let resourceRecords = {}; // { [resourceName]: Record[] }
let chaosLatencyActive = false;
let latencyHistory = [14, 18, 12, 16, 22, 14, 15, 19, 12, 14];
let logCount = 0;
let currentMethodFilter = "ALL";
let activeStudioTab = "presets"; // "presets" | "upload" | "editor"
let uploadedFileContent = null;
let uploadedFileName = null;

// DOM Elements
const valSpecTitleEl = document.getElementById("val-spec-title");
const valSpecVersionEl = document.getElementById("val-spec-version");
const valSpecDescEl = document.getElementById("val-spec-desc");
const navSpecSelectEl = document.getElementById("nav-spec-select");
const optCustomSpecEl = document.getElementById("opt-custom-spec");
const btnHeaderUploadSpecEl = document.getElementById("btn-header-upload-spec");
const specSelectEl = document.getElementById("spec-select");

const endpointsSubtitleEl = document.getElementById("endpoints-subtitle");
const endpointsPillsContainerEl = document.getElementById("endpoints-pills-container");
const countAllRoutesEl = document.getElementById("count-all-routes");
const endpointsFilterGroupEl = document.getElementById("endpoints-filter-group");

const countMockRamEl = document.getElementById("count-mock-ram");
const countRealDbEl = document.getElementById("count-real-db");
const syncPctDisplayEl = document.getElementById("sync-pct-display");
const dotSyncEl = document.getElementById("dot-sync");
const valSyncBadgeEl = document.getElementById("val-sync-badge");
const valRoundtripLatencyEl = document.getElementById("val-roundtrip-latency");

const chartEntitiesDistributionEl = document.getElementById("chart-entities-distribution");
const vizTotalRecordsCountEl = document.getElementById("viz-total-records-count");
const svgMethodsDonutEl = document.getElementById("svg-methods-donut");
const donutCenterValEl = document.getElementById("donut-center-val");
const donutLegendListEl = document.getElementById("donut-legend-list");
const vizMethodsRatioEl = document.getElementById("viz-methods-ratio");
const vizAvgLatencyEl = document.getElementById("viz-avg-latency");
const sparklinePeakEl = document.getElementById("sparkline-peak");
const sparklineLinePathEl = document.getElementById("sparkline-line-path");
const sparklineAreaPathEl = document.getElementById("sparkline-area-path");

const labelSeedBtnEl = document.getElementById("label-seed-btn");
const labelNewBtnEl = document.getElementById("label-new-btn");
const resourceTabsListEl = document.getElementById("resource-tabs-list");
const activeResourceCountEl = document.getElementById("active-resource-count");
const dynamicBoardContentEl = document.getElementById("dynamic-board-content");

const modalCreateTaskEl = document.getElementById("modal-create-task");
const modalCreateTitleEl = document.getElementById("modal-create-title");
const dynamicFormFieldsEl = document.getElementById("dynamic-form-fields");
const formCreateTaskEl = document.getElementById("form-create-task");

const modalSpecViewerEl = document.getElementById("modal-spec-viewer");
const modalActiveSpecBadgeEl = document.getElementById("modal-active-spec-badge");
const codeSpecContentEl = document.getElementById("code-spec-content");
const networkLogEntriesEl = document.getElementById("network-log-entries");
const badgeLogCountEl = document.getElementById("badge-log-count");
const chaosLatencyLabelEl = document.getElementById("chaos-latency-label");
const toastContainerEl = document.getElementById("toast-container");

// Studio Elements
const tabBtnPresetsEl = document.getElementById("tab-btn-presets");
const tabBtnUploadEl = document.getElementById("tab-btn-upload");
const tabBtnEditorEl = document.getElementById("tab-btn-editor");
const studioPanePresetsEl = document.getElementById("studio-pane-presets");
const studioPaneUploadEl = document.getElementById("studio-pane-upload");
const studioPaneEditorEl = document.getElementById("studio-pane-editor");
const specDropzoneEl = document.getElementById("spec-dropzone");
const inputSpecFileEl = document.getElementById("input-spec-file");
const btnBrowseFileEl = document.getElementById("btn-browse-file");
const uploadFileDetailsEl = document.getElementById("upload-file-details");
const labelUploadedFilenameEl = document.getElementById("label-uploaded-filename");
const labelUploadedMetaEl = document.getElementById("label-uploaded-meta");
const btnClearUploadedFileEl = document.getElementById("btn-clear-uploaded-file");
const textareaSpecContentEl = document.getElementById("textarea-spec-content");
const labelEditorStatsEl = document.getElementById("label-editor-stats");
const specApplyStatusEl = document.getElementById("spec-apply-status");
const btnApplySpecModalEl = document.getElementById("btn-apply-spec-modal");

// Toast Notification
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === "success" ? "✓" : type === "error" ? "✕" : "ℹ"}</span> <span>${escapeHtml(message)}</span>`;
  toastContainerEl.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Append Network Activity Log
function appendLog(method, url, status, latencyMs, type = "info") {
  logCount++;
  badgeLogCountEl.textContent = `${logCount} events`;
  const row = document.createElement("div");
  row.className = `log-row ${type}`;
  const time = new Date().toLocaleTimeString();
  row.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="log-method method-${method}">${method}</span>
    <span class="log-url">${url}</span>
    <span class="log-status">${status} (${latencyMs}ms)</span>
  `;
  networkLogEntriesEl.prepend(row);
}

// Escape HTML
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Custom Fetch with Timing and Session Isolation
async function apiFetch(path, options = {}) {
  const start = performance.now();
  const url = `${API_BASE}${path}`;
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "x-session-id": SESSION_ID,
    ...(options.headers || {})
  };

  try {
    const res = await fetch(url, { ...options, headers });
    const latency = Math.round(performance.now() - start);
    valRoundtripLatencyEl.textContent = `${latency}ms`;
    
    latencyHistory.push(latency);
    if (latencyHistory.length > 24) latencyHistory.shift();
    updateSparkline();

    appendLog(
      options.method || "GET",
      path,
      `HTTP ${res.status}`,
      latency,
      res.ok ? "success" : "error"
    );

    if (!res.ok) {
      const errText = await res.text();
      let parsed = errText;
      try { parsed = JSON.parse(errText).message || errText; } catch {}
      throw new Error(parsed);
    }

    if (res.status === 204) return null;
    return await res.json();
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    appendLog(options.method || "GET", path, "ERR", latency, "error");
    throw err;
  }
}

// ==========================================================================
// 1. Dynamic Spec Activation & Endpoints Rendering
// ==========================================================================

async function activateSpec(specInput) {
  let payload = {};
  if (typeof specInput === "string") {
    payload = { specId: specInput };
    showToast(`Activating ${specInput} specification on MockForge...`, "info");
  } else if (specInput && typeof specInput === "object") {
    payload = specInput;
    showToast(`Compiling and activating ${payload.filename || "custom specification"} on MockForge...`, "info");
  }

  try {
    const res = await fetch("/api/activate-spec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, autoSeed: true })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to switch spec");

    activeSpecId = data.activeSpec.id;
    activeSpecDetails = data.activeSpec;
    registeredRoutes = data.routes || [];

    // Sync dropdowns
    if (activeSpecId === "custom") {
      if (optCustomSpecEl) {
        optCustomSpecEl.style.display = "block";
        optCustomSpecEl.textContent = `${data.activeSpec.name} (${data.activeSpec.path})`;
      }
      navSpecSelectEl.value = "custom";
    } else {
      navSpecSelectEl.value = activeSpecId;
      specSelectEl.value = activeSpecId;
    }

    // Update Header Brand
    valSpecTitleEl.textContent = data.activeSpec.name;
    valSpecVersionEl.textContent = data.activeSpec.badge;
    valSpecDescEl.textContent = data.activeSpec.description;
    endpointsSubtitleEl.textContent = `${registeredRoutes.length} endpoints dynamically generated from ${data.activeSpec.path}`;
    countAllRoutesEl.textContent = registeredRoutes.length;

    labelSeedBtnEl.textContent = `Seed Demo ${data.activeSpec.name}`;
    labelNewBtnEl.textContent = `New ${data.activeSpec.primaryResource ? data.activeSpec.primaryResource.slice(0, -1) : "Record"}`;

    // Reset method filter to ALL
    currentMethodFilter = "ALL";

    // Render Dynamic Endpoints Banner
    renderEndpointsBanner();

    // Setup Resource Tabs & Load Data
    setupResourceTabs();
    await loadAllResourceData();

    // Update Data Visualizations
    updateVisualizations();
    await updateDualStoreStats();

    showToast(`✓ Switched to ${data.activeSpec.name} (${registeredRoutes.length} endpoints active)!`);
  } catch (err) {
    showToast(`Spec switch error: ${err.message}`, "error");
  }
}

// Render dynamic endpoints banner with method badges & try request
function renderEndpointsBanner() {
  endpointsPillsContainerEl.innerHTML = "";

  const filtered = currentMethodFilter === "ALL"
    ? registeredRoutes
    : registeredRoutes.filter(r => r.method === currentMethodFilter);

  // Update counts in filter pills
  const counts = { ALL: registeredRoutes.length, GET: 0, POST: 0, PUT: 0, PATCH: 0, DELETE: 0 };
  registeredRoutes.forEach(r => {
    if (counts[r.method] !== undefined) counts[r.method]++;
  });

  endpointsFilterGroupEl.querySelectorAll(".filter-pill").forEach(pill => {
    const m = pill.getAttribute("data-method");
    const count = counts[m] !== undefined ? counts[m] : 0;
    pill.textContent = `${m} (${count})`;
    pill.classList.toggle("active", m === currentMethodFilter);
  });

  if (filtered.length === 0) {
    endpointsPillsContainerEl.innerHTML = `<div class="cards-empty" style="grid-column: 1/-1; padding: 1.5rem;">No ${currentMethodFilter} endpoints defined in ${activeSpecDetails?.name || "active spec"}.</div>`;
    return;
  }

  filtered.forEach(route => {
    const card = document.createElement("div");
    card.className = "endpoint-pill-card";
    card.id = `ep-${route.method.toLowerCase()}-${route.path.replace(/[^a-zA-Z0-9]/g, "-")}`;
    card.innerHTML = `
      <div class="endpoint-left">
        <span class="method-tag method-${route.method}">${route.method}</span>
        <span class="endpoint-path" title="${route.path}">${route.path}</span>
      </div>
      <button class="btn-try-endpoint" title="Execute request against MockForge">
        Try Request
      </button>
    `;

    card.querySelector(".btn-try-endpoint").addEventListener("click", (e) => {
      e.stopPropagation();
      executeEndpointTry(route);
    });

    endpointsPillsContainerEl.appendChild(card);
  });
}

// 1-Click Try Request for any endpoint
async function executeEndpointTry(route) {
  let samplePath = route.path;
  if (samplePath.includes("{")) {
    const existing = resourceRecords[route.resource || ""] || [];
    const firstId = existing.length > 0 ? (existing[0].id || existing[0]._id || "1") : "1";
    samplePath = samplePath.replace(/\{[^}]+\}/, firstId);
  }

  showToast(`Firing ${route.method} ${samplePath}...`, "info");
  try {
    let body = undefined;
    if (route.method === "POST" || route.method === "PUT") {
      body = JSON.stringify({ title: "Sample Generated Record", name: "Sample Entity", status: "active" });
    }
    await apiFetch(samplePath, { method: route.method, body });
    showToast(`✓ ${route.method} ${samplePath} succeeded!`);
    await loadAllResourceData();
  } catch (err) {
    showToast(`${route.method} ${samplePath} -> ${err.message}`, "error");
  }
}

// Filter pills
endpointsFilterGroupEl.querySelectorAll(".filter-pill").forEach(pill => {
  pill.addEventListener("click", () => {
    endpointsFilterGroupEl.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    currentMethodFilter = pill.getAttribute("data-method");
    renderEndpointsBanner();
  });
});

// Spec select listeners
navSpecSelectEl.addEventListener("change", (e) => {
  if (e.target.value === "custom") {
    modalSpecViewerEl.style.display = "flex";
    switchStudioTab("editor");
  } else {
    activateSpec(e.target.value);
  }
});

// ==========================================================================
// 2. Resource Tabs & Dynamic Data Board
// ==========================================================================

function setupResourceTabs() {
  const discoveredResources = Array.from(new Set(registeredRoutes.map(r => r.resource).filter(Boolean)));
  resourceTabsListEl.innerHTML = "";

  if (discoveredResources.length === 0) {
    discoveredResources.push(activeSpecDetails?.primaryResource || "records");
  }

  activeResource = discoveredResources[0];

  discoveredResources.forEach((resName, idx) => {
    const btn = document.createElement("button");
    btn.className = `resource-tab-btn ${idx === 0 ? "active" : ""}`;
    btn.textContent = resName;
    btn.setAttribute("data-resource", resName);
    btn.addEventListener("click", () => {
      resourceTabsListEl.querySelectorAll(".resource-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeResource = resName;
      renderCurrentResourceBoard();
    });
    resourceTabsListEl.appendChild(btn);
  });
}

// Load data for all discovered resources from MockForge
async function loadAllResourceData() {
  const discoveredResources = Array.from(new Set(registeredRoutes.map(r => r.resource).filter(Boolean)));
  for (const res of discoveredResources) {
    try {
      const data = await apiFetch(`/${res}`);
      resourceRecords[res] = Array.isArray(data) ? data : (data.items || []);
    } catch {
      resourceRecords[res] = [];
    }
  }
  renderCurrentResourceBoard();
  updateVisualizations();
}

// Render dynamic board (Kanban for tasks, tables/cards for blog/users)
function renderCurrentResourceBoard() {
  const records = resourceRecords[activeResource] || [];
  activeResourceCountEl.textContent = `${records.length} ${activeResource} loaded`;
  dynamicBoardContentEl.innerHTML = "";

  if (activeSpecId === "tasks" && activeResource === "tasks") {
    renderTasksKanban(records);
  } else {
    renderGenericRecordsTable(activeResource, records);
  }
}

// Kanban view for Tasks
function renderTasksKanban(tasks) {
  const board = document.createElement("div");
  board.className = "kanban-board";

  const todoTasks = tasks.filter(t => !t.done && t.priority !== "high");
  const inFlightTasks = tasks.filter(t => !t.done && t.priority === "high");
  const completedTasks = tasks.filter(t => t.done);

  board.innerHTML = `
    <div class="kanban-col" id="col-todo">
      <div class="col-header">
        <div class="col-title-group">
          <span class="col-indicator slate"></span>
          <h3>Backlog & In Review</h3>
        </div>
        <span class="badge-count">${todoTasks.length}</span>
      </div>
      <div class="cards-list" id="list-todo"></div>
    </div>

    <div class="kanban-col" id="col-in-flight">
      <div class="col-header">
        <div class="col-title-group">
          <span class="col-indicator rose pulse"></span>
          <h3>High Priority & In Flight</h3>
        </div>
        <span class="badge-count">${inFlightTasks.length}</span>
      </div>
      <div class="cards-list" id="list-in-flight"></div>
    </div>

    <div class="kanban-col" id="col-completed">
      <div class="col-header">
        <div class="col-title-group">
          <span class="col-indicator emerald"></span>
          <h3>Completed & Deployed</h3>
        </div>
        <span class="badge-count">${completedTasks.length}</span>
      </div>
      <div class="cards-list" id="list-completed"></div>
    </div>
  `;

  const listTodo = board.querySelector("#list-todo");
  const listInFlight = board.querySelector("#list-in-flight");
  const listCompleted = board.querySelector("#list-completed");

  if (todoTasks.length === 0) listTodo.innerHTML = `<div class="cards-empty">No backlog tasks</div>`;
  else todoTasks.forEach(t => listTodo.appendChild(createTaskCard(t)));

  if (inFlightTasks.length === 0) listInFlight.innerHTML = `<div class="cards-empty">No critical tasks in flight</div>`;
  else inFlightTasks.forEach(t => listInFlight.appendChild(createTaskCard(t)));

  if (completedTasks.length === 0) listCompleted.innerHTML = `<div class="cards-empty">No completed tasks</div>`;
  else completedTasks.forEach(t => listCompleted.appendChild(createTaskCard(t)));

  dynamicBoardContentEl.appendChild(board);
}

// Task Card
function createTaskCard(task) {
  const card = document.createElement("div");
  card.className = `task-card ${task.done ? "done-task" : ""}`;
  card.id = `card-${task.id}`;
  const priorityClass = `priority-${task.priority || "medium"}`;

  card.innerHTML = `
    <div class="task-card-header">
      <span class="task-id">${task.id}</span>
      <span class="priority-tag ${priorityClass}">${task.priority || "medium"}</span>
    </div>
    <div class="task-title">${escapeHtml(task.title)}</div>
    <div class="task-meta">
      ${task.assigneeEmail ? `<span>👤 ${escapeHtml(task.assigneeEmail)}</span>` : ""}
      ${task.dueDate ? `<span>📅 Due: ${escapeHtml(task.dueDate)}</span>` : ""}
      <span>🕒 Created: ${new Date(task.createdAt || Date.now()).toLocaleTimeString()}</span>
    </div>
    <div class="task-actions">
      <button class="action-btn-small" data-action="toggle-done">
        ${task.done ? "↩ Mark Pending" : "✓ Complete"}
      </button>
      <button class="action-btn-small delete" data-action="delete">
        🗑 Delete
      </button>
    </div>
  `;

  card.querySelector('[data-action="toggle-done"]').addEventListener("click", async () => {
    await apiFetch(`/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...task, done: !task.done })
    });
    showToast(`Task ${task.id} updated!`);
    await loadAllResourceData();
  });

  card.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    await apiFetch(`/tasks/${task.id}`, { method: "DELETE" });
    showToast(`Task ${task.id} removed!`);
    await loadAllResourceData();
  });

  return card;
}

// Generic Table View for Blog Posts, Authors, Users
function renderGenericRecordsTable(resource, records) {
  const wrapper = document.createElement("div");
  wrapper.className = "generic-table-card";

  if (records.length === 0) {
    wrapper.innerHTML = `
      <div class="cards-empty" style="padding: 3rem 1rem;">
        <span style="font-size: 1.5rem; margin-bottom: 0.5rem;">📭</span>
        <strong>No ${resource} records in memory yet.</strong>
        <p style="font-size: 0.76rem; color: var(--text-dim); margin-top: 0.25rem;">
          Click 'Seed Demo ${activeSpecDetails?.name}' or 'New Record' to populate RAM.
        </p>
      </div>
    `;
    dynamicBoardContentEl.appendChild(wrapper);
    return;
  }

  // Derive column headers dynamically from first record
  const sample = records[0];
  const keys = Object.keys(sample).slice(0, 5);

  let html = `
    <table class="generic-table">
      <thead>
        <tr>
          ${keys.map(k => `<th>${k}</th>`).join("")}
          <th style="text-align: right;">Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  records.forEach(item => {
    html += `<tr>`;
    keys.forEach(k => {
      let val = item[k];
      if (Array.isArray(val)) {
        val = val.map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join(" ");
      } else if (typeof val === "object" && val !== null) {
        val = JSON.stringify(val);
      } else {
        val = escapeHtml(String(val ?? ""));
      }
      html += `<td>${val}</td>`;
    });
    html += `
      <td style="text-align: right;">
        <button class="action-btn-small delete" data-id="${item.id}">🗑 Delete</button>
      </td>
    </tr>`;
  });

  html += `</tbody></table>`;
  wrapper.innerHTML = html;

  wrapper.querySelectorAll(".action-btn-small.delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      await apiFetch(`/${resource}/${id}`, { method: "DELETE" });
      showToast(`${resource} ${id} removed!`);
      await loadAllResourceData();
    });
  });

  dynamicBoardContentEl.appendChild(wrapper);
}

// ==========================================================================
// 3. Live Data Visualizations & Analytics Logic
// ==========================================================================

function updateVisualizations() {
  const discoveredResources = Array.from(new Set(registeredRoutes.map(r => r.resource).filter(Boolean)));
  let totalRecords = 0;
  discoveredResources.forEach(res => {
    totalRecords += (resourceRecords[res] || []).length;
  });

  vizTotalRecordsCountEl.textContent = `${totalRecords} items in RAM`;

  // 1. In-Memory Entities Bar Chart
  chartEntitiesDistributionEl.innerHTML = "";
  if (discoveredResources.length === 0) {
    chartEntitiesDistributionEl.innerHTML = `<span style="font-size:0.75rem; color:var(--text-dim); padding: 0.5rem 0;">No resources discovered in active spec</span>`;
  } else {
    discoveredResources.forEach((res, idx) => {
      const count = (resourceRecords[res] || []).length;
      const pct = totalRecords > 0 ? Math.round((count / totalRecords) * 100) : 0;
      const colors = ["emerald", "indigo", "amber", "rose"];
      const color = colors[idx % colors.length];

      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `
        <div class="bar-labels">
          <span style="font-weight:700; text-transform:capitalize;">${res}</span>
          <span class="font-mono text-dim">${count} items (${pct}%)</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill ${color}" style="width: ${count > 0 ? Math.max(pct, 8) : 4}%;"></div>
        </div>
      `;
      chartEntitiesDistributionEl.appendChild(row);
    });
  }

  // 2. HTTP Methods Donut Radar
  const methodCounts = { GET: 0, POST: 0, PUT: 0, PATCH: 0, DELETE: 0 };
  registeredRoutes.forEach(r => {
    const m = r.method.toUpperCase();
    if (methodCounts[m] !== undefined) methodCounts[m]++;
    else methodCounts[m] = 1;
  });

  const totalOps = registeredRoutes.length || 1;
  donutCenterValEl.textContent = registeredRoutes.length;
  if (vizMethodsRatioEl) {
    vizMethodsRatioEl.textContent = `${registeredRoutes.length} Routes`;
  }

  const methodColors = {
    GET: "#38bdf8",
    POST: "#34d399",
    PUT: "#fbbf24",
    PATCH: "#fb923c",
    DELETE: "#f87171"
  };

  donutLegendListEl.innerHTML = "";
  let accumulatedAngle = 0;
  const circumference = 2 * Math.PI * 38; // ~238.76

  // Clear existing dynamic segments
  svgMethodsDonutEl.querySelectorAll(".donut-segment").forEach(el => el.remove());

  Object.entries(methodCounts).forEach(([method, count]) => {
    if (count === 0) return;
    const fraction = count / totalOps;
    const strokeDash = fraction * circumference;

    const segment = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    segment.setAttribute("cx", "50");
    segment.setAttribute("cy", "50");
    segment.setAttribute("r", "38");
    segment.setAttribute("class", "donut-segment");
    segment.setAttribute("stroke", methodColors[method] || "#94a3b8");
    segment.setAttribute("stroke-dasharray", `${strokeDash} ${circumference - strokeDash}`);
    segment.setAttribute("stroke-dashoffset", `-${accumulatedAngle}`);
    svgMethodsDonutEl.appendChild(segment);

    accumulatedAngle += strokeDash;

    // Legend item
    const legendItem = document.createElement("div");
    legendItem.className = "donut-legend-item";
    legendItem.innerHTML = `
      <span style="display:flex; align-items:center; gap:0.4rem;">
        <span style="width:8px; height:8px; border-radius:50%; background:${methodColors[method]};"></span>
        <strong style="color:var(--text-main);">${method}</strong>
      </span>
      <span style="color:var(--text-dim);">${count} (${Math.round(fraction * 100)}%)</span>
    `;
    donutLegendListEl.appendChild(legendItem);
  });
}

// Sparkline SVG waveform
function updateSparkline() {
  if (latencyHistory.length < 2) return;
  const width = 360;
  const height = 80;
  const maxVal = Math.max(...latencyHistory, 50);
  const avg = Math.round(latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length);

  vizAvgLatencyEl.textContent = `Avg: ${avg}ms`;
  sparklinePeakEl.textContent = `Peak: ${Math.max(...latencyHistory)}ms`;

  const step = width / (latencyHistory.length - 1);
  const points = latencyHistory.map((val, idx) => {
    const x = idx * step;
    const y = height - (val / maxVal) * (height - 15) - 8;
    return `${x},${y}`;
  });

  const lineD = `M ${points.join(" L ")}`;
  sparklineLinePathEl.setAttribute("d", lineD);
  sparklineAreaPathEl.setAttribute("d", `${lineD} L 360,80 L 0,80 Z`);
}

// ==========================================================================
// 4. Seeding & Dual Store Parity
// ==========================================================================

// Seed demo data tailored for active spec
document.getElementById("btn-seed-tasks").addEventListener("click", async () => {
  showToast(`Seeding enterprise demo data for ${activeSpecDetails?.name || activeSpecId}...`, "info");
  try {
    const res = await fetch("/api/seed-active-spec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specId: activeSpecId, sessionId: SESSION_ID })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Seed failed");

    showToast(`✓ Seeded ${data.count} items into Mock RAM!`);
    await loadAllResourceData();
    await updateDualStoreStats();
  } catch (err) {
    showToast(`Seed error: ${err.message}`, "error");
  }
});

// Update Dual Store Stats
async function updateDualStoreStats() {
  try {
    const records = resourceRecords[activeResource] || [];
    countMockRamEl.textContent = records.length;

    // Container B count
    let realCount = 0;
    try {
      const realRes = await fetch(`${REAL_BACKEND_URL}/${activeResource}`, {
        headers: { "x-session-id": SESSION_ID }
      });
      if (realRes.ok) {
        const realData = await realRes.json();
        realCount = Array.isArray(realData) ? realData.length : (realData.items?.length || 0);
      }
    } catch {}

    countRealDbEl.textContent = realCount;

    if (realCount === records.length && records.length > 0) {
      syncPctDisplayEl.textContent = "100% Match";
      valSyncBadgeEl.textContent = "100% In Sync";
      dotSyncEl.className = "status-dot green";
    } else if (records.length === 0 && realCount === 0) {
      syncPctDisplayEl.textContent = "Empty";
      valSyncBadgeEl.textContent = "0 Records";
      dotSyncEl.className = "status-dot green";
    } else {
      const diff = Math.abs(records.length - realCount);
      syncPctDisplayEl.textContent = `Δ ${diff} Diverged`;
      valSyncBadgeEl.textContent = `${diff} Unsynced`;
      dotSyncEl.className = "status-dot text-amber";
    }
  } catch {
    countRealDbEl.textContent = "Offline";
    valSyncBadgeEl.textContent = "Disconnected";
    dotSyncEl.className = "status-dot text-rose";
  }
}

// Push Memory
document.getElementById("btn-push-memory").addEventListener("click", async () => {
  try {
    showToast("Streaming Mock RAM to Real DB (:8080)...", "info");
    const res = await fetch(`${API_BASE}/__admin/handshake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: MOCK_TARGET_BACKEND_URL,
        direction: "push",
        scopeSession: SESSION_ID,
        conflictStrategy: "upsert"
      })
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Push complete! ${result.entitiesTransferred || 0} entities transferred.`);
      await updateDualStoreStats();
    }
  } catch (err) {
    showToast(`Memory transfer error: ${err.message}`, "error");
  }
});

// Reverse Pull Memory
document.getElementById("btn-pull-memory").addEventListener("click", async () => {
  try {
    showToast("Reverse pulling snapshot from Real DB (:8080)...", "info");
    const res = await fetch(`${API_BASE}/__admin/pull-memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceUrl: MOCK_TARGET_BACKEND_URL,
        scopeSession: SESSION_ID,
        resource: activeResource
      })
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Reverse pull complete! Hydrated records into Mock RAM.`);
      await loadAllResourceData();
    }
  } catch (err) {
    showToast(`Reverse pull error: ${err.message}`, "error");
  }
});

// Seed Real DB Directly
document.getElementById("btn-seed-real-db").addEventListener("click", async () => {
  try {
    showToast("Injecting urgent hotfix task into Real DB (:8080)...", "info");
    const res = await fetch("/api/seed-real-db", { method: "POST" });
    const result = await res.json();
    if (result.success) {
      showToast(`Injected ${result.count} tasks into Real DB!`);
      await updateDualStoreStats();
    }
  } catch (err) {
    showToast(`Direct seed failed: ${err.message}`, "error");
  }
});

// Chaos Latency Toggle
document.getElementById("btn-toggle-latency").addEventListener("click", async () => {
  chaosLatencyActive = !chaosLatencyActive;
  const latency = chaosLatencyActive ? 400 : 0;
  try {
    await fetch(`${API_BASE}/__admin/chaos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latency })
    });
    chaosLatencyLabelEl.textContent = chaosLatencyActive ? "+400ms" : "Off";
    chaosLatencyLabelEl.className = chaosLatencyActive ? "text-amber" : "";
    showToast(`Artificial latency set to ${latency}ms`);
    await loadAllResourceData();
  } catch (err) {
    showToast(`Chaos configuration failed: ${err.message}`, "error");
  }
});

// ==========================================================================
// 5. Dynamic Create Record Form
// ==========================================================================

document.getElementById("btn-open-create-modal").addEventListener("click", () => {
  renderDynamicFormFields();
  modalCreateTitleEl.textContent = `Create New ${activeResource.slice(0, -1).toUpperCase()}`;
  modalCreateTaskEl.style.display = "flex";
});

document.getElementById("btn-close-create-modal").addEventListener("click", () => {
  modalCreateTaskEl.style.display = "none";
});

document.getElementById("btn-cancel-task").addEventListener("click", () => {
  modalCreateTaskEl.style.display = "none";
});

function renderDynamicFormFields() {
  if (activeSpecId === "tasks") {
    dynamicFormFieldsEl.innerHTML = `
      <div class="form-group">
        <label for="input-task-title">Task Title (Min 3 chars) *</label>
        <input type="text" id="input-task-title" required minlength="3" placeholder="e.g. Implement OAuth2 PKCE login" class="form-input">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="select-task-priority">Priority *</label>
          <select id="select-task-priority" class="form-select">
            <option value="high">High</option>
            <option value="medium" selected>Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div class="form-group">
          <label for="input-task-due">Due Date</label>
          <input type="date" id="input-task-due" class="form-input">
        </div>
      </div>
      <div class="form-group">
        <label for="input-task-assignee">Assignee Email</label>
        <input type="email" id="input-task-assignee" placeholder="e.g. dev@enterprise.org" class="form-input">
      </div>
    `;
  } else if (activeSpecId === "blog") {
    if (activeResource === "authors") {
      dynamicFormFieldsEl.innerHTML = `
        <div class="form-group">
          <label for="input-author-name">Author Name *</label>
          <input type="text" id="input-author-name" required placeholder="e.g. Dr. Ada Lovelace" class="form-input">
        </div>
        <div class="form-group">
          <label for="input-author-email">Email Address *</label>
          <input type="email" id="input-author-email" required placeholder="e.g. ada@algorithms.org" class="form-input">
        </div>
        <div class="form-group">
          <label for="input-author-bio">Biography</label>
          <input type="text" id="input-author-bio" placeholder="e.g. Pioneer of Computer Science" class="form-input">
        </div>
      `;
    } else {
      dynamicFormFieldsEl.innerHTML = `
        <div class="form-group">
          <label for="input-post-title">Article Title *</label>
          <input type="text" id="input-post-title" required placeholder="e.g. Advanced Distributed Systems in Node" class="form-input">
        </div>
        <div class="form-group">
          <label for="input-post-body">Content Body *</label>
          <textarea id="input-post-body" rows="3" required placeholder="Write article content..." class="form-input"></textarea>
        </div>
        <div class="form-group">
          <label for="input-post-tags">Tags (comma-separated)</label>
          <input type="text" id="input-post-tags" placeholder="e.g. nodejs, architecture, openapi" class="form-input">
        </div>
      `;
    }
  } else if (activeSpecId === "users") {
    dynamicFormFieldsEl.innerHTML = `
      <div class="form-group">
        <label for="input-user-name">User Full Name *</label>
        <input type="text" id="input-user-name" required placeholder="e.g. Rajesh Kumar" class="form-input">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="input-user-email">Email *</label>
          <input type="email" id="input-user-email" required placeholder="e.g. rajesh@tech.in" class="form-input">
        </div>
        <div class="form-group">
          <label for="input-user-phone">Phone (+91 Indian format) *</label>
          <input type="text" id="input-user-phone" required placeholder="+919876543210" class="form-input">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="input-user-balance">Balance (INR)</label>
          <input type="number" step="0.01" id="input-user-balance" value="5000.00" class="form-input">
        </div>
        <div class="form-group">
          <label for="select-user-status">Status</label>
          <select id="select-user-status" class="form-select">
            <option value="active" selected>Active</option>
            <option value="pending">Pending</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>
    `;
  }
}

// Handle Form Submission
formCreateTaskEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  let payload = {};

  if (activeSpecId === "tasks") {
    payload = {
      title: document.getElementById("input-task-title").value.trim(),
      priority: document.getElementById("select-task-priority").value,
      dueDate: document.getElementById("input-task-due").value || undefined,
      assigneeEmail: document.getElementById("input-task-assignee").value.trim() || undefined,
      done: false
    };
  } else if (activeSpecId === "blog") {
    if (activeResource === "authors") {
      payload = {
        name: document.getElementById("input-author-name").value.trim(),
        email: document.getElementById("input-author-email").value.trim(),
        bio: document.getElementById("input-author-bio").value.trim() || undefined
      };
    } else {
      const tagsRaw = document.getElementById("input-post-tags").value;
      payload = {
        title: document.getElementById("input-post-title").value.trim(),
        body: document.getElementById("input-post-body").value.trim(),
        tags: tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : []
      };
    }
  } else if (activeSpecId === "users") {
    payload = {
      name: document.getElementById("input-user-name").value.trim(),
      email: document.getElementById("input-user-email").value.trim(),
      phone: document.getElementById("input-user-phone").value.trim(),
      balance: parseFloat(document.getElementById("input-user-balance").value) || 0,
      status: document.getElementById("select-user-status").value,
      age: 30
    };
  }

  try {
    const res = await apiFetch(`/${activeResource}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    modalCreateTaskEl.style.display = "none";
    formCreateTaskEl.reset();
    showToast(`Created new ${activeResource.slice(0, -1)}: ${res.id || res.name || res.title}`);
    await loadAllResourceData();
  } catch (err) {
    showToast(`Creation error: ${err.message}`, "error");
  }
});

// ==========================================================================
// 5. OpenAPI Specification Studio & Custom YAML Engine
// ==========================================================================

function switchStudioTab(tabName) {
  activeStudioTab = tabName;
  tabBtnPresetsEl.classList.toggle("active", tabName === "presets");
  tabBtnUploadEl.classList.toggle("active", tabName === "upload");
  tabBtnEditorEl.classList.toggle("active", tabName === "editor");

  studioPanePresetsEl.style.display = tabName === "presets" ? "block" : "none";
  studioPaneUploadEl.style.display = tabName === "upload" ? "block" : "none";
  studioPaneEditorEl.style.display = tabName === "editor" ? "block" : "none";

  if (tabName === "editor" && !textareaSpecContentEl.value && codeSpecContentEl.textContent) {
    textareaSpecContentEl.value = codeSpecContentEl.textContent;
    updateEditorStats();
  }
}

tabBtnPresetsEl.addEventListener("click", () => switchStudioTab("presets"));
tabBtnUploadEl.addEventListener("click", () => switchStudioTab("upload"));
tabBtnEditorEl.addEventListener("click", () => switchStudioTab("editor"));

// Studio File Upload & Drag-and-Drop
btnBrowseFileEl.addEventListener("click", () => inputSpecFileEl.click());
specDropzoneEl.addEventListener("click", (e) => {
  if (e.target !== btnBrowseFileEl) inputSpecFileEl.click();
});

specDropzoneEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  specDropzoneEl.classList.add("dragover");
});

specDropzoneEl.addEventListener("dragleave", () => {
  specDropzoneEl.classList.remove("dragover");
});

specDropzoneEl.addEventListener("drop", (e) => {
  e.preventDefault();
  specDropzoneEl.classList.remove("dragover");
  const file = e.dataTransfer.files?.[0];
  if (file) handleProcessSpecFile(file);
});

inputSpecFileEl.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) handleProcessSpecFile(file);
});

function handleProcessSpecFile(file) {
  const validExts = [".yaml", ".yml", ".json"];
  const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
  if (!validExts.includes(ext)) {
    showToast(`Unsupported file type (${ext}). Please choose a .yaml, .yml, or .json file.`, "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedFileContent = String(e.target.result || "");
    uploadedFileName = file.name;
    const lines = uploadedFileContent.split("\n").length;
    const sizeStr = file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`;

    labelUploadedFilenameEl.textContent = file.name;
    labelUploadedMetaEl.textContent = `${sizeStr} • ${lines} lines`;
    uploadFileDetailsEl.style.display = "flex";

    textareaSpecContentEl.value = uploadedFileContent;
    updateEditorStats();

    showToast(`Loaded ${file.name} (${lines} lines). Click 'Apply & Hot-Reload' to activate!`);
  };
  reader.onerror = () => showToast("Failed to read specification file.", "error");
  reader.readAsText(file);
}

btnClearUploadedFileEl.addEventListener("click", () => {
  uploadedFileContent = null;
  uploadedFileName = null;
  inputSpecFileEl.value = "";
  uploadFileDetailsEl.style.display = "none";
});

// Textarea Stats
function updateEditorStats() {
  const text = textareaSpecContentEl.value;
  const lines = text ? text.split("\n").length : 0;
  labelEditorStatsEl.textContent = `${lines} lines • ${text.length} chars`;
}
textareaSpecContentEl.addEventListener("input", updateEditorStats);

// 1-Click Apply on MockForge
btnApplySpecModalEl.addEventListener("click", async () => {
  specApplyStatusEl.style.display = "inline";
  specApplyStatusEl.textContent = "Compiling & hot-reloading spec...";
  specApplyStatusEl.style.color = "var(--emerald-400)";

  try {
    if (activeStudioTab === "presets") {
      await activateSpec(specSelectEl.value);
    } else if (activeStudioTab === "upload") {
      if (!uploadedFileContent) {
        throw new Error("Please select or drop a .yaml or .json file first.");
      }
      await activateSpec({ specContent: uploadedFileContent, filename: uploadedFileName });
    } else {
      const text = textareaSpecContentEl.value.trim();
      if (!text) throw new Error("YAML specification editor is empty.");
      await activateSpec({ specContent: text, filename: "custom-edited-spec.yaml" });
    }

    specApplyStatusEl.textContent = "Spec applied successfully!";
    setTimeout(() => {
      modalSpecViewerEl.style.display = "none";
      specApplyStatusEl.style.display = "none";
    }, 800);
  } catch (err) {
    specApplyStatusEl.textContent = `Error: ${err.message}`;
    specApplyStatusEl.style.color = "var(--rose-400)";
    showToast(err.message, "error");
  }
});

// Open Studio Modals
btnHeaderUploadSpecEl.addEventListener("click", () => {
  modalSpecViewerEl.style.display = "flex";
  switchStudioTab("upload");
});

document.getElementById("btn-view-spec").addEventListener("click", async () => {
  modalSpecViewerEl.style.display = "flex";
  switchStudioTab("presets");
  await loadSpecContent(specSelectEl.value);
});

document.getElementById("btn-close-spec-modal").addEventListener("click", () => {
  modalSpecViewerEl.style.display = "none";
});

document.getElementById("btn-close-spec-view").addEventListener("click", () => {
  modalSpecViewerEl.style.display = "none";
});

specSelectEl.addEventListener("change", async (e) => {
  await loadSpecContent(e.target.value);
});

async function loadSpecContent(specId) {
  codeSpecContentEl.textContent = "Loading specification...";
  try {
    const res = await fetch(`/api/specs?id=${specId}`);
    const data = await res.json();
    modalActiveSpecBadgeEl.textContent = data.activeSpec.path;
    codeSpecContentEl.textContent = data.content;
    textareaSpecContentEl.value = data.content;
    updateEditorStats();
  } catch (err) {
    codeSpecContentEl.textContent = `Error loading spec: ${err.message}`;
  }
}

// Refresh button
document.getElementById("btn-refresh").addEventListener("click", async () => {
  showToast("Refreshing data from MockForge...");
  await loadAllResourceData();
  await updateDualStoreStats();
});

// Drawer toggle
document.getElementById("drawer-toggle").addEventListener("click", () => {
  const body = document.getElementById("drawer-log-body");
  body.style.display = body.style.display === "none" ? "block" : "none";
});

// Live Heartbeat telemetry ping
setInterval(async () => {
  try {
    const start = performance.now();
    const res = await fetch(`${API_BASE}/__health`);
    if (res.ok) {
      const lat = Math.round(performance.now() - start);
      valRoundtripLatencyEl.textContent = `${lat}ms`;
      latencyHistory.push(lat);
      if (latencyHistory.length > 24) latencyHistory.shift();
      updateSparkline();
    }
  } catch {}
}, 2500);

// Check query params for instant activation or modal
const urlParams = new URLSearchParams(window.location.search);
const initSpec = urlParams.get("spec") || "tasks";
activateSpec(initSpec);

if (urlParams.get("viewSpec") === "true") {
  modalSpecViewerEl.style.display = "flex";
  loadSpecContent("tasks");
}
