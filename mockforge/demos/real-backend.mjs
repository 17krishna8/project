import http from "node:http";

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";

// Real Backend in-memory database partitioned by session
const database = {
  sessions: new Map()
};

function getSessionStore(sessionId = "default") {
  if (!database.sessions.has(sessionId)) {
    database.sessions.set(sessionId, {
      tasks: [
        {
          id: "tsk_real0001",
          title: "Real Production Database Initial Record",
          priority: "high",
          done: false,
          createdAt: new Date().toISOString()
        }
      ]
    });
  }
  return database.sessions.get(sessionId);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;

  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-session-id");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const sessionId = req.headers["x-session-id"] || url.searchParams.get("sessionId") || "default";
  const store = getSessionStore(sessionId);

  // Health probe
  if (url.pathname === "/health" || url.pathname === "/__health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        service: "real-production-backend",
        port: PORT,
        activeSessions: database.sessions.size,
        timestamp: new Date().toISOString()
      })
    );
    return;
  }

  // Memory Ingestion / Seeding endpoint (Stage 3 of Handshake)
  if (url.pathname === "/api/seed" && method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const targetSession = payload.sessionId || sessionId;
        const memory = payload.memory || {};
        const strategy = payload.strategy || "upsert";

        const sessionData = getSessionStore(targetSession);

        if (strategy === "clean_sync") {
          for (const key of Object.keys(sessionData)) delete sessionData[key];
        }

        let ingestedCount = 0;
        for (const [resource, items] of Object.entries(memory)) {
          if (!sessionData[resource]) sessionData[resource] = [];
          if (Array.isArray(items)) {
            for (const item of items) {
              const existingIdx = sessionData[resource].findIndex((r) => r.id === item.id);
              if (existingIdx >= 0) {
                if (strategy === "upsert") {
                  sessionData[resource][existingIdx] = item;
                  ingestedCount++;
                }
              } else {
                sessionData[resource].push(item);
                ingestedCount++;
              }
            }
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "success",
            message: `Ingested ${ingestedCount} records for session: ${targetSession}`,
            sessionId: targetSession,
            ingestedCount,
            currentResources: Object.keys(sessionData)
          })
        );
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // State inspection endpoint (for Dual Memory Viewer)
  if (url.pathname === "/api/seed/state" && method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        sessionId,
        resources: store
      })
    );
    return;
  }

  // Tasks Resource API
  if (url.pathname === "/tasks") {
    if (method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json", "X-Backend-Server": "real-8080" });
      res.end(JSON.stringify(store.tasks || []));
      return;
    }
    if (method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const item = JSON.parse(body || "{}");
          item.id = item.id && item.id.startsWith("tsk_") ? item.id : `tsk_${Math.random().toString(36).slice(2, 10)}`;
          item.done = Boolean(item.done);
          item.priority = item.priority || "medium";
          item.createdAt = item.createdAt || new Date().toISOString();
          if (!store.tasks) store.tasks = [];
          store.tasks.push(item);
          res.writeHead(201, { "Content-Type": "application/json", "X-Backend-Server": "real-8080" });
          res.end(JSON.stringify(item));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
  }

  // Fallback 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: `Not found on Real Backend: ${method} ${url.pathname}` }));
});

server.listen(PORT, HOST, () => {
  console.log(`[Real Backend Server] Listening at http://${HOST}:${PORT}`);
  console.log(`  Health:       http://${HOST}:${PORT}/health`);
  console.log(`  Tasks API:    http://${HOST}:${PORT}/tasks`);
  console.log(`  Seed Ingest:  http://${HOST}:${PORT}/api/seed`);
});
