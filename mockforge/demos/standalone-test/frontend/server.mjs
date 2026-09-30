import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "5175", 10);
const HOST = "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const MOCKFORGE_URL = process.env.MOCKFORGE_URL || "http://127.0.0.1:3000";
const REAL_BACKEND_URL = process.env.REAL_BACKEND_URL || "http://127.0.0.1:8085";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // API 1: Return the bundled E-Commerce YAML specification
  if (url.pathname === "/api/spec-content") {
    const yamlPath = path.resolve(__dirname, "..", "ecommerce.yaml");
    let content = "";
    try {
      content = fs.readFileSync(yamlPath, "utf-8");
    } catch (err) {
      content = `# Error reading ecommerce.yaml: ${err.message}`;
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ filename: "ecommerce.yaml", content }));
    return;
  }

  // API 2: Forward spec activation to MockForge dummy server (:3000)
  if (url.pathname === "/api/activate-on-mockforge" && req.method === "POST") {
    let raw = "";
    req.on("data", chunk => raw += chunk);
    req.on("end", async () => {
      try {
        const payload = JSON.parse(raw || "{}");
        const yamlPath = path.resolve(__dirname, "..", "ecommerce.yaml");
        const specContent = payload.specContent || fs.readFileSync(yamlPath, "utf-8");
        const filename = payload.filename || "ecommerce.yaml";

        // Forward to MockForge
        const mfRes = await fetch(`${MOCKFORGE_URL}/__admin/spec`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spec: specContent, filename })
        });
        const mfData = await mfRes.json();
        if (!mfRes.ok) throw new Error(mfData.error?.message || "MockForge rejected spec reload");

        // Fetch newly compiled routes
        const routesRes = await fetch(`${MOCKFORGE_URL}/__admin/routes`);
        const routes = routesRes.ok ? await routesRes.json() : [];

        // Auto-seed initial products in MockForge RAM if empty
        const sampleProducts = [
          { name: "Ultra-Wide 4K Gaming Monitor 144Hz", category: "computing", price: 549.99, stock: 35 },
          { name: "Tactile Mechanical Keyboard RGB", category: "computing", price: 139.50, stock: 80 },
          { name: "Studio Noise-Cancelling ANC Headphones", category: "audio", price: 279.00, stock: 45 },
          { name: "Ergonomic Mesh Desk Chair Pro", category: "electronics", price: 389.00, stock: 20 }
        ];

        for (const prod of sampleProducts) {
          try {
            await fetch(`${MOCKFORGE_URL}/products`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-session-id": "session-standalone" },
              body: JSON.stringify(prod)
            });
          } catch {}
        }

        const sampleOrders = [
          { customerName: "Aarav Sundaram", customerEmail: "aarav@tech.org", totalAmount: 689.49, status: "processing", itemsCount: 2, shippingCity: "Bengaluru" },
          { customerName: "Meera Krishnan", customerEmail: "meera@cloud.io", totalAmount: 279.00, status: "shipped", itemsCount: 1, shippingCity: "Chennai" }
        ];
        for (const ord of sampleOrders) {
          try {
            await fetch(`${MOCKFORGE_URL}/orders`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-session-id": "session-standalone" },
              body: JSON.stringify(ord)
            });
          } catch {}
        }

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({
          success: true,
          mockforgeResult: mfData,
          routes,
          mockforgeUrl: MOCKFORGE_URL,
          realBackendUrl: REAL_BACKEND_URL
        }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Serve static files from public/
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

server.listen(PORT, HOST, () => {
  console.log(`[Standalone Test Frontend] Running at http://${HOST}:${PORT}`);
  console.log(`[Standalone Test Frontend] Connected to MockForge (:3000) and Real Backend (:8085)`);
});
