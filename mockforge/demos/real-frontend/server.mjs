import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "5173", 10);
const PUBLIC_DIR = path.join(__dirname, "public");
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const MOCKFORGE_URL = process.env.MOCKFORGE_URL || "http://127.0.0.1:3000";
const REAL_BACKEND_URL = process.env.REAL_BACKEND_URL || "http://127.0.0.1:8080";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

const SPECS = [
  {
    id: "tasks",
    name: "Tasks API",
    badge: "OpenAPI 3.0.3",
    path: "samples/tasks.yaml",
    primaryResource: "tasks",
    description: "Task Management API with Kanban workflow, priorities (high/medium/low), due dates, and assignee emails.",
    endpoints: ["GET /tasks", "POST /tasks", "GET /tasks/{taskId}", "PATCH /tasks/{taskId}", "DELETE /tasks/{taskId}"]
  },
  {
    id: "blog",
    name: "Blog API",
    badge: "OpenAPI 3.0.3",
    path: "samples/blog.yaml",
    primaryResource: "posts",
    description: "Full Blog Engine with Authors and Articles. Exercises relational routing, sorting, filtering, and PUT vs PATCH.",
    endpoints: ["GET /authors", "POST /authors", "GET /authors/{authorId}", "DELETE /authors/{authorId}", "GET /posts", "POST /posts", "GET /posts/{postId}", "PUT /posts/{postId}"]
  },
  {
    id: "users",
    name: "Users API",
    badge: "OpenAPI 3.0.3",
    path: "acceptance/fixtures/users.yaml",
    primaryResource: "users",
    description: "Enterprise User Directory with Indian phone number regex (+91), decimal bank balances, status enums, and age limits.",
    endpoints: ["GET /users", "POST /users", "GET /users/{id}", "PUT /users/{id}", "PATCH /users/{id}", "DELETE /users/{id}"]
  },
  {
    id: "orders",
    name: "Orders API",
    badge: "Swagger 2.0",
    path: "samples/orders.json",
    primaryResource: "orders",
    description: "E-Commerce Orders and Products inventory spec with nested line items and price calculation.",
    endpoints: ["GET /products", "POST /products", "GET /orders", "POST /orders"]
  }
];

let activeSpecId = "tasks";
let currentCustomSpec = null;

async function seedDemoDataForSpec(specId, routes = [], sessionId = "session-prod-dev") {
  const currentSpec = specId || activeSpecId;
  const inserted = [];

  if (currentSpec === "tasks") {
    const tasks = [
      {
        title: "🔒 Implement OAuth 2.0 PKCE authentication flow",
        priority: "high",
        done: false,
        assigneeEmail: "security-lead@enterprise.org",
        dueDate: "2026-10-15"
      },
      {
        title: "🐘 Migrate Postgres database cluster to Multi-AZ RDS",
        priority: "high",
        done: false,
        assigneeEmail: "devops-lead@enterprise.org",
        dueDate: "2026-10-20"
      },
      {
        title: "🎨 Design glassmorphic analytics dashboard widgets",
        priority: "medium",
        done: false,
        assigneeEmail: "ui-architect@enterprise.org",
        dueDate: "2026-10-12"
      },
      {
        title: "⚡ Optimize Redis cache invalidation on checkout",
        priority: "medium",
        done: true,
        assigneeEmail: "backend-core@enterprise.org",
        dueDate: "2026-10-18"
      },
      {
        title: "🛡️ Audit third-party npm dependencies for CVEs",
        priority: "low",
        done: false,
        assigneeEmail: "qa-lead@enterprise.org",
        dueDate: "2026-10-05"
      }
    ];

    for (const t of tasks) {
      const r = await fetch(`${MOCKFORGE_URL}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-id": sessionId },
        body: JSON.stringify(t)
      });
      if (r.ok) inserted.push(await r.json());
    }
  } else if (currentSpec === "blog") {
    // Seed Authors
    const authors = [
      { name: "Dr. Elena Rostova", email: "elena.rostova@ai-lab.io", bio: "Principal Systems Architect and Distributed Computing Researcher" },
      { name: "Marcus Chen", email: "marcus.chen@cloudnative.dev", bio: "Kubernetes SIG Contributor & Linux Kernel Enthusiast" },
      { name: "Aria Thorne", email: "aria.thorne@designsystems.co", bio: "Staff Product Designer specializing in Glassmorphism & Micro-animations" }
    ];
    for (const a of authors) {
      const r = await fetch(`${MOCKFORGE_URL}/authors`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-id": sessionId },
        body: JSON.stringify(a)
      });
      if (r.ok) inserted.push(await r.json());
    }

    // Seed Posts
    const posts = [
      { title: "Building Zero-Latency Reactive Architectures in Node.js", body: "Exploring Fastify routing tables and in-memory event dispatching at scale.", tags: ["architecture", "fastify", "performance"] },
      { title: "Deterministic Mocking vs Production Drift", body: "Why OpenAPI 3.0 schema contracts and bidirectional memory transfer eliminate integration bugs.", tags: ["testing", "openapi", "devops"] },
      { title: "Modern Design Tokens in Enterprise Web Apps", body: "Crafting Obsidian palettes, glowing borders, and accessible telemetry dials.", tags: ["ui", "design", "css"] }
    ];
    for (const p of posts) {
      const r = await fetch(`${MOCKFORGE_URL}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-id": sessionId },
        body: JSON.stringify(p)
      });
      if (r.ok) inserted.push(await r.json());
    }
  } else if (currentSpec === "users") {
    const users = [
      { name: "Vikram Malhotra", email: "vikram.m@techindia.in", phone: "+919876543210", balance: 14500.5, status: "active", age: 34 },
      { name: "Ananya Sharma", email: "ananya.s@bengaluru-dev.org", phone: "+919812345678", balance: 28900.0, status: "active", age: 29 },
      { name: "Rahul Verma", email: "rahul.verma@fintech.net", phone: "+919900112233", balance: 5200.75, status: "pending", age: 41 },
      { name: "Priya Nair", email: "priya.nair@hyderabad-cloud.io", phone: "+919733445566", balance: 84300.25, status: "active", age: 38 }
    ];
    for (const u of users) {
      const r = await fetch(`${MOCKFORGE_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-id": sessionId },
        body: JSON.stringify(u)
      });
      if (r.ok) inserted.push(await r.json());
    }
  } else if (currentSpec === "orders") {
    const products = [
      { name: "Ergonomic Mechanical Keyboard", price: 149.99, category: "Hardware" },
      { name: "4K Ultra-Wide Curved Monitor", price: 699.50, category: "Hardware" },
      { name: "Noise-Cancelling Studio Headphones", price: 299.00, category: "Audio" }
    ];
    for (const prod of products) {
      const r = await fetch(`${MOCKFORGE_URL}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-id": sessionId },
        body: JSON.stringify(prod)
      });
      if (r.ok) inserted.push(await r.json());
    }
  } else {
    // Dynamic fallback seeding for custom spec resources
    const discoveredResources = Array.from(new Set(routes.map(r => r.resource).filter(Boolean)));
    for (const res of discoveredResources) {
      const sampleItem = {
        name: `Sample ${res.slice(0, -1)} Item`,
        title: `Dynamic Seeded ${res.slice(0, -1)}`,
        status: "active",
        createdAt: new Date().toISOString()
      };
      try {
        const r = await fetch(`${MOCKFORGE_URL}/${res}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-session-id": sessionId },
          body: JSON.stringify(sampleItem)
        });
        if (r.ok) inserted.push(await r.json());
      } catch {}
    }
  }

  return inserted;
}

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // API 1: List all available specs and retrieve spec content
  if (url.pathname === "/api/specs") {
    const currentSpecId = url.searchParams.get("id") || activeSpecId;
    let selected = SPECS.find((s) => s.id === currentSpecId);
    let content = "";

    if (!selected && currentCustomSpec) {
      selected = currentCustomSpec;
      content = currentCustomSpec.content || "";
    } else if (!selected) {
      selected = SPECS[0];
    }

    if (!content && selected && selected.path) {
      const fullPath = path.join(ROOT_DIR, selected.path);
      try {
        content = fs.readFileSync(fullPath, "utf-8");
      } catch (err) {
        content = `# Error reading ${selected.path}: ${err.message}`;
      }
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ specs: SPECS, activeSpec: selected, activeSpecId, content }));
    return;
  }

  // API 2: Switch active OpenAPI spec on MockForge dynamically (by specId OR custom uploaded/pasted YAML content)
  if (url.pathname === "/api/activate-spec" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const { specId, specContent, filename, autoSeed = true } = payload;

        let finalSpecContent = "";
        let finalFilename = filename || "custom-spec.yaml";
        let activeSpecObj = null;

        if (specContent && typeof specContent === "string" && specContent.trim()) {
          // Custom uploaded or pasted YAML / JSON spec
          finalSpecContent = specContent.trim();
          const titleMatch = finalSpecContent.match(/title:\s*["']?([^"'\r\n]+)/i) || finalSpecContent.match(/"title":\s*"([^"]+)"/i);
          const versionMatch = finalSpecContent.match(/version:\s*["']?([^"'\r\n]+)/i) || finalSpecContent.match(/"version":\s*"([^"]+)"/i);
          const title = titleMatch ? titleMatch[1].trim() : "Custom API";
          const version = versionMatch ? versionMatch[1].trim() : "1.0.0";

          activeSpecObj = {
            id: "custom",
            name: title,
            badge: `OpenAPI (Custom v${version})`,
            path: finalFilename,
            primaryResource: "records",
            description: `Loaded custom YAML specification (${finalFilename}) with dynamic live endpoints.`,
            content: finalSpecContent
          };
          currentCustomSpec = activeSpecObj;
          activeSpecId = "custom";
        } else {
          // Preset spec by ID
          const found = SPECS.find((s) => s.id === specId);
          if (!found) throw new Error(`Unknown spec ID: ${specId}. Supported: ${SPECS.map(s => s.id).join(", ")}`);

          const fullPath = path.join(ROOT_DIR, found.path);
          finalSpecContent = fs.readFileSync(fullPath, "utf-8");
          finalFilename = path.basename(found.path);
          activeSpecObj = found;
          activeSpecId = found.id;
          currentCustomSpec = null;
        }

        // Forward spec reload to MockForge Core
        const mfRes = await fetch(`${MOCKFORGE_URL}/__admin/spec`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spec: finalSpecContent, filename: finalFilename })
        });
        const mfData = await mfRes.json();
        if (!mfRes.ok) throw new Error(mfData.error?.message || "MockForge rejected spec reload");

        // Query newly registered routes from MockForge
        const routesRes = await fetch(`${MOCKFORGE_URL}/__admin/routes`);
        const routes = routesRes.ok ? await routesRes.json() : [];

        // Auto-seed initial demo data if requested so data visualizations immediately populate!
        if (autoSeed) {
          try {
            await seedDemoDataForSpec(activeSpecObj.id, routes, "session-prod-dev");
          } catch (seedErr) {
            console.warn("[Auto-Seed Warning]", seedErr.message);
          }
        }

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            success: true,
            activeSpec: activeSpecObj,
            mockforgeResult: mfData,
            routes
          })
        );
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API 3: Seed real-world demo data tailored for the active spec
  if (url.pathname === "/api/seed-active-spec" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { specId, sessionId = "session-prod-dev" } = JSON.parse(body || "{}");
        const currentSpec = specId || activeSpecId;

        // Query routes to aid dynamic seeding
        const routesRes = await fetch(`${MOCKFORGE_URL}/__admin/routes`);
        const routes = routesRes.ok ? await routesRes.json() : [];

        const inserted = await seedDemoDataForSpec(currentSpec, routes, sessionId);

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ success: true, count: inserted.length, items: inserted }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }

  // API 4: Direct seed to Real Backend (Container B on :8080) for real-world memory reverse testing
  if (url.pathname === "/api/seed-real-db" && req.method === "POST") {
    try {
      const realBackendUrl = `${REAL_BACKEND_URL}/tasks`;
      const sampleTasks = [
        {
          id: `tsk_k8s${Date.now().toString(36).slice(-6)}`,
          title: "🔥 Production Urgent: Patch Zero-Day OpenSSL in K8s Cluster",
          priority: "high",
          done: false,
          assigneeEmail: "devops-lead@enterprise.org",
          dueDate: "2026-10-02",
          createdAt: new Date().toISOString()
        },
        {
          id: `tsk_rds${Date.now().toString(36).slice(-6)}`,
          title: "⚡ Scale Redis Sentinel Replicas for High QPS Flash Sale",
          priority: "high",
          done: false,
          assigneeEmail: "infra-architect@enterprise.org",
          dueDate: "2026-10-03",
          createdAt: new Date().toISOString()
        }
      ];

      const inserted = [];
      for (const task of sampleTasks) {
        const response = await fetch(realBackendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-id": req.headers["x-session-id"] || "session-prod-dev"
          },
          body: JSON.stringify(task)
        });
        if (response.ok) {
          inserted.push(await response.json());
        }
      }

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ success: true, count: inserted.length, tasks: inserted }));
      return;
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
  }

  // Serve static assets from public/
  let filePath = path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }
    res.setHeader("Content-Type", contentType);
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Real Frontend App] Running at http://127.0.0.1:${PORT}`);
  console.log(`[Real Frontend App] Connected to MockForge API at http://127.0.0.1:3000`);
});
