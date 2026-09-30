/**
 * ForgeCommerce - Standalone OpenAPI Test Suite Client Logic
 * Connects seamlessly to MockForge Dummy Server (:3000) and Standalone Real Backend (:8085)
 */

// Configuration & Global State
const CONFIG = {
  mockforgeUrl: "http://127.0.0.1:3000",
  realBackendUrl: "http://127.0.0.1:8085",
  localApiUrl: window.location.origin
};

const state = {
  currentTarget: CONFIG.mockforgeUrl, // Default: MockForge Dummy
  activeMethodFilter: "ALL",
  activeResourceTab: "products",
  routes: [],
  specContent: "",
  specInfo: { title: "E-Commerce Store & Inventory API", version: "1.5.0" },
  products: [],
  orders: [],
  mockCount: 0,
  realCount: 0,
  latencyHistory: [12, 10, 15, 11, 9, 14, 12, 10, 13, 11],
  simulatedDelay: 0
};

// UI Elements Cache
const elements = {
  // Brand / Header
  specTitle: document.getElementById("val-spec-title"),
  specVersion: document.getElementById("val-spec-version"),
  specDesc: document.getElementById("val-spec-desc"),
  btnTargetMock: document.getElementById("btn-target-mock"),
  btnTargetReal: document.getElementById("btn-target-real"),
  valLatency: document.getElementById("val-latency"),
  dotSync: document.getElementById("dot-sync"),
  valSyncState: document.getElementById("val-sync-state"),
  btnOpenSpecModal: document.getElementById("btn-open-spec-modal"),

  // Endpoints section
  endpointsSubtitle: document.getElementById("endpoints-subtitle"),
  endpointsContainer: document.getElementById("endpoints-container"),
  countAllRoutes: document.getElementById("count-all-routes"),
  filterPills: document.querySelectorAll("#endpoints-filter-group .pill"),

  // Parity section
  valMockCount: document.getElementById("val-mock-count"),
  valRealCount: document.getElementById("val-real-count"),
  valSyncDiff: document.getElementById("val-sync-diff"),
  btnPushToReal: document.getElementById("btn-push-to-real"),
  btnPullFromReal: document.getElementById("btn-pull-from-real"),

  // Visualizations
  vizEntitiesTotal: document.getElementById("viz-entities-total"),
  chartEntitiesBars: document.getElementById("chart-entities-bars"),
  vizRoutesCount: document.getElementById("viz-routes-count"),
  svgDonutRadar: document.getElementById("svg-donut-radar"),
  donutOpsVal: document.getElementById("donut-ops-val"),
  donutLegendList: document.getElementById("donut-legend-list"),
  vizLatencyAvg: document.getElementById("viz-latency-avg"),
  sparklinePeak: document.getElementById("sparkline-peak"),
  sparklineFillPath: document.getElementById("sparkline-fill-path"),
  sparklineStrokePath: document.getElementById("sparkline-stroke-path"),

  // Toolbar
  btnSeedData: document.getElementById("btn-seed-data"),
  btnCreateProduct: document.getElementById("btn-create-product"),
  btnCreateOrder: document.getElementById("btn-create-order"),
  btnRefreshAll: document.getElementById("btn-refresh-all"),
  chaosToggleBtn: document.getElementById("chaos-toggle-btn"),
  valChaosStatus: document.getElementById("val-chaos-status"),

  // Data tabs & catalog
  resourceTabs: document.querySelectorAll(".resource-tab"),
  countTabProducts: document.getElementById("count-tab-products"),
  countTabOrders: document.getElementById("count-tab-orders"),
  labelActiveResCount: document.getElementById("label-active-res-count"),
  viewProducts: document.getElementById("view-products"),
  viewOrders: document.getElementById("view-orders"),
  productsCatalogContainer: document.getElementById("products-catalog-container"),
  ordersTableBody: document.getElementById("orders-table-body"),

  // Modals
  modalSpecStudio: document.getElementById("modal-spec-studio"),
  btnCloseSpecModal: document.getElementById("btn-close-spec-modal"),
  btnDismissSpecModal: document.getElementById("btn-dismiss-spec-modal"),
  tabStudioView: document.getElementById("tab-studio-view"),
  tabStudioEdit: document.getElementById("tab-studio-edit"),
  paneStudioView: document.getElementById("pane-studio-view"),
  paneStudioEdit: document.getElementById("pane-studio-edit"),
  codeSpecViewer: document.getElementById("code-spec-viewer"),
  textareaYamlEditor: document.getElementById("textarea-yaml-editor"),
  labelYamlStats: document.getElementById("label-yaml-stats"),
  btnApplySpecChanges: document.getElementById("btn-apply-spec-changes"),
  labelApplyStatus: document.getElementById("label-apply-status"),
  modalSpecFilename: document.getElementById("modal-spec-filename"),

  modalAddProduct: document.getElementById("modal-add-product"),
  btnCloseProductModal: document.getElementById("btn-close-product-modal"),
  btnCancelProduct: document.getElementById("btn-cancel-product"),
  formAddProduct: document.getElementById("form-add-product"),

  modalAddOrder: document.getElementById("modal-add-order"),
  btnCloseOrderModal: document.getElementById("btn-close-order-modal"),
  btnCancelOrder: document.getElementById("btn-cancel-order"),
  formAddOrder: document.getElementById("form-add-order"),

  toastHub: document.getElementById("toast-hub")
};

// Toast Notification Manager
function showToast(title, message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast-item toast-${type}`;
  
  const icon = type === "success" ? "✅" : type === "error" ? "❌" : type === "warning" ? "⚠️" : "⚡";
  
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${message}</div>
    </div>
  `;
  
  elements.toastHub.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(30px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 320);
  }, 4200);
}

// Measured Fetch Utility for Latency Telemetry
async function timedFetch(url, options = {}) {
  if (state.simulatedDelay > 0) {
    await new Promise(r => setTimeout(r, state.simulatedDelay));
  }
  const t0 = performance.now();
  try {
    const res = await fetch(url, options);
    const roundtrip = Math.round(performance.now() - t0);
    recordLatency(roundtrip);
    return res;
  } catch (err) {
    const roundtrip = Math.round(performance.now() - t0);
    recordLatency(roundtrip);
    throw err;
  }
}

function recordLatency(ms) {
  state.latencyHistory.push(ms);
  if (state.latencyHistory.length > 20) {
    state.latencyHistory.shift();
  }
  
  elements.valLatency.textContent = `${ms}ms`;
  
  const avg = Math.round(state.latencyHistory.reduce((a, b) => a + b, 0) / state.latencyHistory.length);
  const peak = Math.max(...state.latencyHistory);
  
  elements.vizLatencyAvg.textContent = `Avg: ${avg}ms`;
  elements.sparklinePeak.textContent = `Peak: ${peak}ms`;
  
  renderSparkline();
}

function renderSparkline() {
  const pts = state.latencyHistory;
  if (!pts || pts.length < 2) return;
  
  const width = 360;
  const height = 80;
  const max = Math.max(...pts, 30);
  const step = width / (pts.length - 1);
  
  const coords = pts.map((val, idx) => {
    const x = Math.round(idx * step);
    const y = Math.round(height - (val / max) * (height - 15) - 5);
    return { x, y };
  });
  
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x},${c.y}`).join(" ");
  const fillPath = `${linePath} L ${width},${height} L 0,${height} Z`;
  
  elements.sparklineStrokePath.setAttribute("d", linePath);
  elements.sparklineFillPath.setAttribute("d", fillPath);
}

// Target Switcher Logic
function setTarget(target) {
  state.currentTarget = target;
  if (target === CONFIG.mockforgeUrl) {
    elements.btnTargetMock.classList.add("active");
    elements.btnTargetReal.classList.remove("active");
    showToast("Gateway Switched", "Active target set to MockForge Dummy Server (:3000)", "info");
  } else {
    elements.btnTargetReal.classList.add("active");
    elements.btnTargetMock.classList.remove("active");
    showToast("Gateway Switched", "Active target set to Standalone Real Backend (:8085)", "info");
  }
  fetchCatalogAndOrders();
  refreshParityCounts();
}

// Spec Loader & AST Extractor
async function loadSpecAndRoutes() {
  try {
    // 1. Fetch spec content from local static backend
    const res = await timedFetch(`${CONFIG.localApiUrl}/api/spec-content`);
    if (res.ok) {
      const data = await res.json();
      state.specContent = data.content || "";
      elements.codeSpecViewer.textContent = state.specContent;
      elements.textareaYamlEditor.value = state.specContent;
      
      const lineCount = state.specContent.split("\n").length;
      elements.labelYamlStats.textContent = `${lineCount} lines (${Math.round(state.specContent.length / 1024)} KB)`;
      
      // Parse basic YAML title, version, and description
      const titleMatch = state.specContent.match(/title:\s*["']?([^"'\n]+)["']?/);
      const verMatch = state.specContent.match(/version:\s*["']?([^"'\n]+)["']?/);
      const descMatch = state.specContent.match(/description:\s*(?:>-\s*|\s*\|\s*)?([^\n\r]+(?:\n\s+[^\n\r]+)*)/);
      
      if (titleMatch) state.specInfo.title = titleMatch[1].trim();
      if (verMatch) state.specInfo.version = verMatch[1].trim();
      
      elements.specTitle.textContent = state.specInfo.title;
      elements.specVersion.textContent = `v${state.specInfo.version}`;
      if (descMatch && descMatch[1] && !descMatch[1].startsWith(">-")) {
        elements.specDesc.textContent = descMatch[1].replace(/\s+/g, " ").trim();
      } else {
        elements.specDesc.textContent = "Production E-Commerce API contract • Dynamic Endpoints & Data Visualizations";
      }
    }

    // 2. Fetch active compiled routes from MockForge
    try {
      const routesRes = await timedFetch(`${CONFIG.mockforgeUrl}/__admin/routes`);
      if (routesRes.ok) {
        state.routes = await routesRes.json();
      }
    } catch (e) {
      console.warn("Could not fetch MockForge routes directly, deriving from spec");
    }

    // Fallback routes if MockForge returned empty
    if (!state.routes || state.routes.length === 0) {
      state.routes = [
        { method: "GET", path: "/products", kind: "list", resource: "products", summary: "List catalog products with filtering" },
        { method: "POST", path: "/products", kind: "create", resource: "products", summary: "Add a new product to catalog" },
        { method: "GET", path: "/products/{productId}", kind: "read", resource: "products", summary: "Get single product by ID" },
        { method: "PUT", path: "/products/{productId}", kind: "update", resource: "products", summary: "Update product price and stock" },
        { method: "DELETE", path: "/products/{productId}", kind: "delete", resource: "products", summary: "Delete product from catalog" },
        { method: "GET", path: "/orders", kind: "list", resource: "orders", summary: "List customer orders with status filter" },
        { method: "POST", path: "/orders", kind: "create", resource: "orders", summary: "Place a new customer order" },
        { method: "GET", path: "/orders/{orderId}", kind: "read", resource: "orders", summary: "Retrieve order details" },
        { method: "PATCH", path: "/orders/{orderId}", kind: "update", resource: "orders", summary: "Transition order fulfillment status" },
        { method: "DELETE", path: "/orders/{orderId}", kind: "delete", resource: "orders", summary: "Cancel order" }
      ];
    }

    renderEndpoints();
    renderDonutRadar();
  } catch (err) {
    console.error("Failed to load spec:", err);
    showToast("Spec Loading Error", err.message, "error");
  }
}

// Dynamic Endpoints Renderer
function renderEndpoints() {
  const filtered = state.routes.filter(r => {
    if (state.activeMethodFilter === "ALL") return true;
    return r.method.toUpperCase() === state.activeMethodFilter;
  });

  elements.countAllRoutes.textContent = state.routes.length;
  elements.endpointsSubtitle.textContent = `${state.routes.length} active routes compiled from ecommerce.yaml (OpenAPI 3.0.3)`;

  if (filtered.length === 0) {
    elements.endpointsContainer.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: var(--text-dim);">
        No endpoints found for method filter <strong>${state.activeMethodFilter}</strong>.
      </div>
    `;
    return;
  }

  elements.endpointsContainer.innerHTML = filtered.map(route => {
    const method = route.method.toUpperCase();
    const mLower = method.toLowerCase();
    
    return `
      <div class="endpoint-card">
        <div class="ep-left">
          <span class="method-badge ${mLower}">${method}</span>
          <span class="ep-path" title="${escapeHtml(route.path)}">${escapeHtml(route.path)}</span>
        </div>
        <button type="button" class="btn-try btn-try-endpoint" data-method="${method}" data-path="${escapeHtml(route.path)}">
          ⚡ Try
        </button>
      </div>
    `;
  }).join("");

  // Attach Try Request buttons
  elements.endpointsContainer.querySelectorAll(".btn-try-endpoint").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const method = btn.dataset.method;
      let path = btn.dataset.path;
      
      // Resolve path parameters with sample IDs
      if (path.includes("{productId}")) {
        const sampleId = state.products[0]?.id || "prod_k8s01";
        path = path.replace("{productId}", sampleId);
      } else if (path.includes("{orderId}")) {
        const sampleId = state.orders[0]?.id || "ord_ecom01";
        path = path.replace("{orderId}", sampleId);
      }

      const targetUrl = `${state.currentTarget}${path}`;
      btn.textContent = "⏳ Calling...";
      btn.disabled = true;

      try {
        const fetchOpts = { method, headers: { "Content-Type": "application/json" } };
        if (method === "POST" && path.startsWith("/products")) {
          fetchOpts.body = JSON.stringify({ name: "Demo Test Product", category: "computing", price: 99.95, stock: 15 });
        } else if (method === "POST" && path.startsWith("/orders")) {
          fetchOpts.body = JSON.stringify({ customerName: "Test Buyer", totalAmount: 99.95, status: "pending" });
        } else if (method === "PATCH") {
          fetchOpts.body = JSON.stringify({ status: "delivered" });
        }

        const res = await timedFetch(targetUrl, fetchOpts);
        let respData = null;
        try { respData = await res.json(); } catch {}

        if (res.ok) {
          showToast(`Success [${res.status}]`, `${method} ${path} returned ${res.status} OK`, "success");
        } else {
          showToast(`Response [${res.status}]`, `${method} ${path} -> ${res.statusText}`, "warning");
        }
        
        // Refresh catalog and parity
        fetchCatalogAndOrders();
        refreshParityCounts();
      } catch (err) {
        showToast("Request Failed", `${method} ${path}: ${err.message}`, "error");
      } finally {
        btn.textContent = "⚡ Try Request";
        btn.disabled = false;
      }
    });
  });
}

// Chart 2: Donut Radar for Operation Types
function renderDonutRadar() {
  const counts = { GET: 0, POST: 0, PUT: 0, PATCH: 0, DELETE: 0 };
  state.routes.forEach(r => {
    const m = r.method.toUpperCase();
    if (counts[m] !== undefined) counts[m]++;
    else counts.GET++;
  });

  const total = state.routes.length || 1;
  elements.donutOpsVal.textContent = total;
  elements.vizRoutesCount.textContent = `${total} Routes`;

  const colors = {
    GET: "#38bdf8",     // sky
    POST: "#34d399",    // emerald
    PUT: "#fbbf24",     // amber
    PATCH: "#a855f7",   // purple
    DELETE: "#f87171"   // rose
  };

  const circumference = 2 * Math.PI * 38; // r=38 -> ~238.76
  let currentOffset = 0;
  let circlesHtml = `<circle cx="50" cy="50" r="38" class="donut-track" />`;

  for (const [method, count] of Object.entries(counts)) {
    if (count === 0) continue;
    const segmentLength = (count / total) * circumference;
    const dashArray = `${segmentLength.toFixed(2)} ${(circumference - segmentLength).toFixed(2)}`;
    const dashOffset = (-currentOffset).toFixed(2);
    currentOffset += segmentLength;

    circlesHtml += `
      <circle cx="50" cy="50" r="38" fill="transparent"
        stroke="${colors[method]}" stroke-width="8"
        stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}"
        stroke-linecap="round" class="donut-segment" />
    `;
  }

  elements.svgDonutRadar.innerHTML = circlesHtml;

  // Donut legend
  elements.donutLegendList.innerHTML = Object.entries(counts)
    .filter(([_, cnt]) => cnt > 0)
    .map(([method, cnt]) => `
      <div class="donut-legend-item">
        <span class="legend-color-dot" style="background: ${colors[method]};"></span>
        <span class="legend-name">${method}</span>
        <strong class="legend-count font-mono">${cnt}</strong>
      </div>
    `).join("");
}

// Chart 1: In-Memory Entities Distribution Bars
function renderEntitiesBars() {
  const prodCount = state.products.length;
  const orderCount = state.orders.length;
  const total = prodCount + orderCount;

  elements.vizEntitiesTotal.textContent = `${total} items in active RAM`;

  const prodPct = total > 0 ? Math.round((prodCount / total) * 100) : 50;
  const orderPct = total > 0 ? Math.round((orderCount / total) * 100) : 50;

  elements.chartEntitiesBars.innerHTML = `
    <div class="entity-bar-row">
      <div class="entity-bar-label">
        <span>🛍️ Products Catalog</span>
        <strong class="font-mono">${prodCount} (${prodPct}%)</strong>
      </div>
      <div class="bar-track">
        <div class="bar-fill emerald" style="width: ${Math.max(prodPct, 5)}%;"></div>
      </div>
    </div>
    <div class="entity-bar-row">
      <div class="entity-bar-label">
        <span>📦 Customer Orders</span>
        <strong class="font-mono">${orderCount} (${orderPct}%)</strong>
      </div>
      <div class="bar-track">
        <div class="bar-fill indigo" style="width: ${Math.max(orderPct, 5)}%;"></div>
      </div>
    </div>
  `;
}

// Dual-Store Parity & Memory Transfer
async function refreshParityCounts() {
  try {
    // 1. Fetch count from MockForge RAM
    let mockProducts = 0;
    let mockOrders = 0;
    try {
      const pRes = await fetch(`${CONFIG.mockforgeUrl}/products`);
      if (pRes.ok) {
        const pData = await pRes.json();
        mockProducts = Array.isArray(pData) ? pData.length : 0;
      }
      const oRes = await fetch(`${CONFIG.mockforgeUrl}/orders`);
      if (oRes.ok) {
        const oData = await oRes.json();
        mockOrders = Array.isArray(oData) ? oData.length : 0;
      }
    } catch {}
    state.mockCount = mockProducts + mockOrders;
    elements.valMockCount.textContent = state.mockCount;

    // 2. Fetch count from Real Backend DB (:8085)
    try {
      const realRes = await fetch(`${CONFIG.realBackendUrl}/health`);
      if (realRes.ok) {
        const rData = await realRes.json();
        state.realCount = (rData.productsCount || 0) + (rData.ordersCount || 0);
      }
    } catch {}
    elements.valRealCount.textContent = state.realCount;

    // 3. Compute Parity
    const diff = Math.abs(state.mockCount - state.realCount);
    if (diff === 0 && state.mockCount > 0) {
      elements.dotSync.className = "status-dot green";
      elements.valSyncState.textContent = "100% In Sync";
      elements.valSyncDiff.textContent = "100% Match (0 Diff)";
      elements.valSyncDiff.className = "sync-diff-badge match";
    } else {
      elements.dotSync.className = "status-dot yellow";
      elements.valSyncState.textContent = `${diff} Delta Unsynced`;
      elements.valSyncDiff.textContent = `Δ ${diff} Delta`;
      elements.valSyncDiff.className = "sync-diff-badge delta";
    }
  } catch (err) {
    console.warn("Parity check warning:", err.message);
  }
}

// Push Mock RAM to Real Backend (:8085)
async function pushMemoryToReal() {
  elements.btnPushToReal.disabled = true;
  elements.btnPushToReal.innerHTML = "<span>⏳ Pushing...</span>";
  try {
    // Fetch all current items from MockForge
    const [pRes, oRes] = await Promise.all([
      fetch(`${CONFIG.mockforgeUrl}/products`),
      fetch(`${CONFIG.mockforgeUrl}/orders`)
    ]);
    const products = pRes.ok ? await pRes.json() : [];
    const orders = oRes.ok ? await oRes.json() : [];

    const syncRes = await timedFetch(`${CONFIG.realBackendUrl}/api/sync-memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products, orders })
    });
    const syncData = await syncRes.json();

    if (syncRes.ok) {
      showToast("Memory Pushed to Real DB", `Synchronized ${syncData.importedCount} items into Real Backend (:8085)`, "success");
      await refreshParityCounts();
      if (state.currentTarget === CONFIG.realBackendUrl) {
        fetchCatalogAndOrders();
      }
    } else {
      throw new Error(syncData.error || "Failed to sync memory");
    }
  } catch (err) {
    showToast("Push Failed", err.message, "error");
  } finally {
    elements.btnPushToReal.disabled = false;
    elements.btnPushToReal.innerHTML = "<span>➡️ Push Memory</span>";
  }
}

// Pull Real Backend (:8085) into Mock RAM
async function pullMemoryFromReal() {
  elements.btnPullFromReal.disabled = true;
  elements.btnPullFromReal.innerHTML = "<span>⏳ Pulling...</span>";
  try {
    const dumpRes = await timedFetch(`${CONFIG.realBackendUrl}/api/dump-memory`);
    if (!dumpRes.ok) throw new Error("Could not dump real memory");
    const dumpData = await dumpRes.json();
    const realDb = dumpData.data || {};

    let pushed = 0;
    if (realDb.products) {
      for (const p of realDb.products) {
        try {
          await fetch(`${CONFIG.mockforgeUrl}/products`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p)
          });
          pushed++;
        } catch {}
      }
    }

    if (realDb.orders) {
      for (const o of realDb.orders) {
        try {
          await fetch(`${CONFIG.mockforgeUrl}/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(o)
          });
          pushed++;
        } catch {}
      }
    }

    showToast("Memory Pulled to MockForge", `Imported ${pushed} entities into Mock RAM (:3000)`, "success");
    await refreshParityCounts();
    if (state.currentTarget === CONFIG.mockforgeUrl) {
      fetchCatalogAndOrders();
    }
  } catch (err) {
    showToast("Pull Failed", err.message, "error");
  } finally {
    elements.btnPullFromReal.disabled = false;
    elements.btnPullFromReal.innerHTML = "<span>⬅️ Pull Memory</span>";
  }
}

// Fetch Catalog Products and Orders
async function fetchCatalogAndOrders() {
  try {
    const [pRes, oRes] = await Promise.all([
      timedFetch(`${state.currentTarget}/products`),
      timedFetch(`${state.currentTarget}/orders`)
    ]);

    if (pRes.ok) {
      const data = await pRes.json();
      state.products = Array.isArray(data) ? data : [];
    } else {
      state.products = [];
    }

    if (oRes.ok) {
      const data = await oRes.json();
      state.orders = Array.isArray(data) ? data : [];
    } else {
      state.orders = [];
    }

    renderProducts();
    renderOrders();
    renderEntitiesBars();
    refreshParityCounts();

    elements.countTabProducts.textContent = state.products.length;
    elements.countTabOrders.textContent = state.orders.length;
    
    updateActiveResourceSummary();
  } catch (err) {
    console.error("Fetch catalog error:", err);
    showToast("Data Sync Notice", `Target responded: ${err.message}`, "warning");
  }
}

function updateActiveResourceSummary() {
  const count = state.activeResourceTab === "products" ? state.products.length : state.orders.length;
  elements.labelActiveResCount.textContent = `${count} ${state.activeResourceTab} loaded`;
}

// Render Products Grid
function renderProducts() {
  if (state.products.length === 0) {
    elements.productsCatalogContainer.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 3rem; text-align: center; color: var(--text-dim);">
        <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">Catalog is currently empty.</p>
        <button type="button" class="btn-cta emerald" onclick="document.getElementById('btn-seed-data').click()">
          🌱 Seed Sample Catalog
        </button>
      </div>
    `;
    return;
  }

  const categoryIcons = {
    computing: "💻",
    audio: "🎧",
    electronics: "⚡",
    apparel: "👕"
  };

  elements.productsCatalogContainer.innerHTML = state.products.map(p => {
    const icon = categoryIcons[p.category?.toLowerCase()] || "📦";
    const priceFormatted = Number(p.price || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
    const stockClass = (p.stock || 0) < 25 ? "stock-low" : "stock-ok";

    return `
      <div class="product-card">
        <div class="product-card-top">
          <div class="product-icon-box">${icon}</div>
          <span class="product-cat-pill">${escapeHtml(p.category || "general")}</span>
        </div>
        <h4 class="product-title">${escapeHtml(p.name || "Product Name")}</h4>
        <div class="product-id font-mono">ID: ${escapeHtml(p.id || "unknown")}</div>
        <div class="product-stats-row">
          <span class="product-price font-mono">${priceFormatted}</span>
          <span class="product-stock ${stockClass}">Stock: ${p.stock || 0}</span>
        </div>
        <div class="product-actions">
          <button type="button" class="btn-card-action btn-delete-prod" data-id="${escapeHtml(p.id)}">
            🗑️ Delete
          </button>
        </div>
      </div>
    `;
  }).join("");

  // Attach delete handlers
  elements.productsCatalogContainer.querySelectorAll(".btn-delete-prod").forEach(btn => {
    btn.addEventListener("click", async () => {
      const pId = btn.dataset.id;
      if (!confirm(`Delete product ${pId}?`)) return;
      try {
        const res = await timedFetch(`${state.currentTarget}/products/${pId}`, { method: "DELETE" });
        if (res.ok || res.status === 204) {
          showToast("Product Deleted", `Removed product ${pId}`, "success");
          fetchCatalogAndOrders();
        } else {
          showToast("Delete Failed", `HTTP ${res.status}`, "error");
        }
      } catch (e) {
        showToast("Error", e.message, "error");
      }
    });
  });
}

// Render Orders Table
function renderOrders() {
  if (state.orders.length === 0) {
    elements.ordersTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-dim);">
          No active orders found. Click "Place Order" above to create one.
        </td>
      </tr>
    `;
    return;
  }

  const statusColors = {
    pending: "badge-status-pending",
    processing: "badge-status-processing",
    shipped: "badge-status-shipped",
    delivered: "badge-status-delivered"
  };

  elements.ordersTableBody.innerHTML = state.orders.map(o => {
    const statusClass = statusColors[o.status?.toLowerCase()] || "badge-status-pending";
    const amountFormatted = Number(o.totalAmount || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

    return `
      <tr>
        <td class="font-mono" style="font-weight: 600; color: var(--amber-400);">${escapeHtml(o.id || "ord_unknown")}</td>
        <td><strong>${escapeHtml(o.customerName || "Customer")}</strong></td>
        <td class="font-mono text-dim" style="font-size: 0.8rem;">${escapeHtml(o.customerEmail || "-")}</td>
        <td>${o.itemsCount || 1} items</td>
        <td>${escapeHtml(o.shippingCity || "Bengaluru")}</td>
        <td class="font-mono" style="font-weight: 700;">${amountFormatted}</td>
        <td><span class="badge-status ${statusClass}">${escapeHtml(o.status || "pending")}</span></td>
        <td style="text-align: right;">
          <select class="select-order-status" data-id="${escapeHtml(o.id)}">
            <option value="pending" ${o.status === "pending" ? "selected" : ""}>Pending</option>
            <option value="processing" ${o.status === "processing" ? "selected" : ""}>Processing</option>
            <option value="shipped" ${o.status === "shipped" ? "selected" : ""}>Shipped</option>
            <option value="delivered" ${o.status === "delivered" ? "selected" : ""}>Delivered</option>
          </select>
          <button type="button" class="btn-table-del btn-delete-order" data-id="${escapeHtml(o.id)}" title="Cancel Order">❌</button>
        </td>
      </tr>
    `;
  }).join("");

  // Status transition handlers
  elements.ordersTableBody.querySelectorAll(".select-order-status").forEach(select => {
    select.addEventListener("change", async (e) => {
      const oId = select.dataset.id;
      const newStatus = select.value;
      try {
        const res = await timedFetch(`${state.currentTarget}/orders/${oId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
          showToast("Order Updated", `Order ${oId} transitioned to ${newStatus}`, "success");
          fetchCatalogAndOrders();
        } else {
          showToast("Update Failed", `HTTP ${res.status}`, "error");
        }
      } catch (err) {
        showToast("Error", err.message, "error");
      }
    });
  });

  // Delete handlers
  elements.ordersTableBody.querySelectorAll(".btn-delete-order").forEach(btn => {
    btn.addEventListener("click", async () => {
      const oId = btn.dataset.id;
      if (!confirm(`Cancel and delete order ${oId}?`)) return;
      try {
        const res = await timedFetch(`${state.currentTarget}/orders/${oId}`, { method: "DELETE" });
        if (res.ok || res.status === 204) {
          showToast("Order Cancelled", `Order ${oId} removed`, "success");
          fetchCatalogAndOrders();
        } else {
          showToast("Delete Failed", `HTTP ${res.status}`, "error");
        }
      } catch (err) {
        showToast("Error", err.message, "error");
      }
    });
  });
}

// Seed Catalog Action
async function seedCatalog() {
  elements.btnSeedData.disabled = true;
  elements.btnSeedData.innerHTML = "<span>⏳ Seeding...</span>";
  try {
    const res = await timedFetch(`${CONFIG.localApiUrl}/api/activate-on-mockforge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "ecommerce.yaml" })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to seed catalog");

    showToast("Catalog Seeded", "Sample products and orders populated into MockForge RAM", "success");
    await loadSpecAndRoutes();
    await fetchCatalogAndOrders();
  } catch (err) {
    showToast("Seeding Error", err.message, "error");
  } finally {
    elements.btnSeedData.disabled = false;
    elements.btnSeedData.innerHTML = "<span>🌱</span> <span>Seed E-Commerce Catalog</span>";
  }
}

// OpenAPI Specification Studio Hot-Reload
async function applySpecHotReload() {
  const newSpec = elements.textareaYamlEditor.value;
  if (!newSpec.trim()) return;

  elements.btnApplySpecChanges.disabled = true;
  elements.btnApplySpecChanges.textContent = "⚡ Compiling & Hot-Reloading...";
  elements.labelApplyStatus.style.display = "inline";
  elements.labelApplyStatus.textContent = "Transmitting to MockForge engine...";

  try {
    const res = await timedFetch(`${CONFIG.localApiUrl}/api/activate-on-mockforge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specContent: newSpec, filename: "ecommerce.yaml" })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Spec reload failed");

    elements.labelApplyStatus.textContent = "✅ Applied & Routes Reloaded!";
    showToast("OpenAPI Hot-Reloaded", `MockForge recompiled ${data.routes?.length || 10} endpoints dynamically!`, "success");
    
    state.specContent = newSpec;
    elements.codeSpecViewer.textContent = newSpec;
    
    await loadSpecAndRoutes();
    await fetchCatalogAndOrders();

    setTimeout(() => {
      elements.modalSpecStudio.style.display = "none";
      elements.labelApplyStatus.style.display = "none";
    }, 1200);
  } catch (err) {
    elements.labelApplyStatus.textContent = `❌ ${err.message}`;
    elements.labelApplyStatus.style.color = "var(--rose-400)";
    showToast("Hot-Reload Failed", err.message, "error");
  } finally {
    elements.btnApplySpecChanges.disabled = false;
    elements.btnApplySpecChanges.textContent = "⚡ Apply & Hot-Reload on MockForge";
  }
}

// Utility: HTML Escaper
function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Event Listeners Initialization
function initEventListeners() {
  // Target Switcher
  elements.btnTargetMock.addEventListener("click", () => setTarget(CONFIG.mockforgeUrl));
  elements.btnTargetReal.addEventListener("click", () => setTarget(CONFIG.realBackendUrl));

  // Parity Bridges
  elements.btnPushToReal.addEventListener("click", pushMemoryToReal);
  elements.btnPullFromReal.addEventListener("click", pullMemoryFromReal);

  // Endpoints Method Filter Pills
  elements.filterPills.forEach(pill => {
    pill.addEventListener("click", () => {
      elements.filterPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      state.activeMethodFilter = pill.dataset.method;
      renderEndpoints();
    });
  });

  // Resource Tab Switching (Products vs Orders)
  elements.resourceTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      elements.resourceTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const resName = tab.dataset.res;
      state.activeResourceTab = resName;
      if (resName === "products") {
        elements.viewProducts.style.display = "block";
        elements.viewOrders.style.display = "none";
      } else {
        elements.viewProducts.style.display = "none";
        elements.viewOrders.style.display = "block";
      }
      updateActiveResourceSummary();
    });
  });

  // Toolbar Actions
  elements.btnSeedData.addEventListener("click", seedCatalog);
  elements.btnRefreshAll.addEventListener("click", () => {
    fetchCatalogAndOrders();
    showToast("Refreshed", "Catalog, telemetry, and parity counts refreshed", "info");
  });

  // Simulated Latency Toggle
  elements.chaosToggleBtn.addEventListener("click", () => {
    if (state.simulatedDelay === 0) {
      state.simulatedDelay = 250;
      elements.valChaosStatus.textContent = "+250ms";
      elements.chaosToggleBtn.classList.add("active");
      showToast("Latency Injected", "Simulated +250ms roundtrip delay enabled", "warning");
    } else if (state.simulatedDelay === 250) {
      state.simulatedDelay = 800;
      elements.valChaosStatus.textContent = "+800ms";
      showToast("High Latency Injected", "Simulated +800ms slow network delay enabled", "warning");
    } else {
      state.simulatedDelay = 0;
      elements.valChaosStatus.textContent = "Off (0ms)";
      elements.chaosToggleBtn.classList.remove("active");
      showToast("Latency Restored", "Simulated latency cleared (0ms)", "info");
    }
  });

  // Modal 1: OpenAPI Studio
  elements.btnOpenSpecModal.addEventListener("click", () => {
    elements.modalSpecStudio.style.display = "flex";
  });
  elements.btnCloseSpecModal.addEventListener("click", () => {
    elements.modalSpecStudio.style.display = "none";
  });
  elements.btnDismissSpecModal.addEventListener("click", () => {
    elements.modalSpecStudio.style.display = "none";
  });
  elements.tabStudioView.addEventListener("click", () => {
    elements.tabStudioView.classList.add("active");
    elements.tabStudioEdit.classList.remove("active");
    elements.paneStudioView.style.display = "block";
    elements.paneStudioEdit.style.display = "none";
  });
  elements.tabStudioEdit.addEventListener("click", () => {
    elements.tabStudioEdit.classList.add("active");
    elements.tabStudioView.classList.remove("active");
    elements.paneStudioView.style.display = "none";
    elements.paneStudioEdit.style.display = "block";
  });
  elements.btnApplySpecChanges.addEventListener("click", applySpecHotReload);

  // Modal 2: Create Product
  elements.btnCreateProduct.addEventListener("click", () => {
    elements.modalAddProduct.style.display = "flex";
  });
  elements.btnCloseProductModal.addEventListener("click", () => {
    elements.modalAddProduct.style.display = "none";
  });
  elements.btnCancelProduct.addEventListener("click", () => {
    elements.modalAddProduct.style.display = "none";
  });
  elements.formAddProduct.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("input-product-name").value.trim();
    const category = document.getElementById("select-product-cat").value;
    const price = parseFloat(document.getElementById("input-product-price").value);
    const stock = parseInt(document.getElementById("input-product-stock").value || "10", 10);

    try {
      const res = await timedFetch(`${state.currentTarget}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, price, stock })
      });
      if (res.ok) {
        showToast("Product Created", `"${name}" added successfully`, "success");
        elements.formAddProduct.reset();
        elements.modalAddProduct.style.display = "none";
        fetchCatalogAndOrders();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast("Error", d.error || `HTTP ${res.status}`, "error");
      }
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  });

  // Modal 3: Place Order
  elements.btnCreateOrder.addEventListener("click", () => {
    elements.modalAddOrder.style.display = "flex";
  });
  elements.btnCloseOrderModal.addEventListener("click", () => {
    elements.modalAddOrder.style.display = "none";
  });
  elements.btnCancelOrder.addEventListener("click", () => {
    elements.modalAddOrder.style.display = "none";
  });
  elements.formAddOrder.addEventListener("submit", async (e) => {
    e.preventDefault();
    const customerName = document.getElementById("input-order-customer").value.trim();
    const customerEmail = document.getElementById("input-order-email").value.trim();
    const shippingCity = document.getElementById("input-order-city").value.trim();
    const totalAmount = parseFloat(document.getElementById("input-order-amount").value);
    const itemsCount = parseInt(document.getElementById("input-order-items").value || "1", 10);

    try {
      const res = await timedFetch(`${state.currentTarget}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName, customerEmail, shippingCity, totalAmount, itemsCount, status: "pending" })
      });
      if (res.ok) {
        showToast("Order Placed", `Order created for ${customerName}`, "success");
        elements.formAddOrder.reset();
        elements.modalAddOrder.style.display = "none";
        fetchCatalogAndOrders();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast("Error", d.error || `HTTP ${res.status}`, "error");
      }
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  });

  // Auto-refresh parity every 8 seconds
  setInterval(refreshParityCounts, 8000);
}

// Initial App Bootstrapping
async function bootstrap() {
  console.log("[ForgeCommerce] Bootstrapping standalone test suite...");
  initEventListeners();
  renderSparkline();
  await loadSpecAndRoutes();
  await fetchCatalogAndOrders();
  await refreshParityCounts();
  console.log("[ForgeCommerce] Ready!");
}

document.addEventListener("DOMContentLoaded", bootstrap);
