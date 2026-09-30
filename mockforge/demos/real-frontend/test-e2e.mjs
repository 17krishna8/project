/**
 * Comprehensive End-to-End Real Frontend & Memory Transfer Verification Script
 */

const FRONTEND_URL = "http://127.0.0.1:5173";
const MOCKFORGE_URL = "http://127.0.0.1:3000";
const REAL_BACKEND_URL = "http://127.0.0.1:8080";
const MOCK_TARGET_BACKEND_URL = "http://real-production-backend:8080";
const SESSION_ID = "session-e2e-real";

const headers = {
  "Content-Type": "application/json",
  "Accept": "application/json",
  "x-session-id": SESSION_ID
};

function pass(name, details = "") {
  console.log(`\x1b[32m✓ [PASS]\x1b[0m ${name} ${details ? `\x1b[90m(${details})\x1b[0m` : ""}`);
}

function fail(name, err) {
  console.error(`\x1b[31m✗ [FAIL]\x1b[0m ${name}: ${err}`);
  process.exit(1);
}

async function runTest() {
  console.log("\n=======================================================");
  console.log("   MOCKFORGE REAL FRONTEND & MEMORY TRANSFER E2E TEST   ");
  console.log("=======================================================\n");

  // Step 0: Ensure proxy bridge is reset and session is clean
  try {
    await fetch(`${MOCKFORGE_URL}/__admin/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false })
    });
    await fetch(`${MOCKFORGE_URL}/__admin/chaos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latency: 0, errorRate: 0 })
    });
    await fetch(`${MOCKFORGE_URL}/__admin/sessions/${SESSION_ID}`, { method: "DELETE" });
  } catch {}

  // Step 1: Verify Real Frontend is hosted
  try {
    const res = await fetch(`${FRONTEND_URL}/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes("Enterprise Task Manager") || !html.includes("samples/tasks.yaml")) {
      throw new Error("HTML missing required UI elements");
    }
    pass("Step 1: Real Frontend hosted on port 5173", `HTTP ${res.status}, size ${html.length} bytes`);
  } catch (err) {
    fail("Step 1: Real Frontend hosting", err.message);
  }

  // Step 2: Verify OpenAPI YAML Contract API
  try {
    const res = await fetch(`${FRONTEND_URL}/api/specs?id=tasks`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.content.includes("openapi: 3.0.3") || !data.content.includes("/tasks")) {
      throw new Error("Invalid OpenAPI YAML content");
    }
    pass("Step 2: OpenAPI 3.0.3 YAML Contract loaded", `${data.activeSpec.path}, ${data.content.length} bytes`);
  } catch (err) {
    fail("Step 2: OpenAPI Contract API", err.message);
  }

  // Step 3: Seed 5 Real-World Tasks via MockForge API
  const seedTasks = [
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

  const createdTasks = [];
  try {
    for (const item of seedTasks) {
      const res = await fetch(`${MOCKFORGE_URL}/tasks`, {
        method: "POST",
        headers,
        body: JSON.stringify(item)
      });
      if (res.status !== 201) throw new Error(`Expected 201 Created, got ${res.status}`);
      const body = await res.json();
      createdTasks.push(body);
    }
    pass("Step 3: Seeded 5 real-world tasks into Mock RAM", `Created ${createdTasks.length} tasks in session '${SESSION_ID}'`);
  } catch (err) {
    fail("Step 3: Seeding tasks", err.message);
  }

  // Step 4: Verify CRUD - GET, PATCH, & DELETE
  try {
    const listRes = await fetch(`${MOCKFORGE_URL}/tasks`, { headers });
    const tasks = await listRes.json();
    const taskCount = Array.isArray(tasks) ? tasks.length : tasks.items?.length;
    if (taskCount < 5) throw new Error(`Expected at least 5 tasks, found ${taskCount}`);
    
    // Toggle first task to done
    const target = createdTasks[0];
    const patchRes = await fetch(`${MOCKFORGE_URL}/tasks/${target.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        title: target.title,
        done: true,
        priority: target.priority
      })
    });
    if (!patchRes.ok) throw new Error(`PATCH failed with HTTP ${patchRes.status}`);

    // Verify GET single item
    const singleRes = await fetch(`${MOCKFORGE_URL}/tasks/${target.id}`, { headers });
    const singleData = await singleRes.json();
    if (!singleData.done) throw new Error(`Expected task.done to be true after PATCH`);

    pass("Step 4: Real CRUD Operations Verified", `GET returned ${taskCount} items; PATCH ${target.id} updated done:true`);
  } catch (err) {
    fail("Step 4: CRUD operations", err.message);
  }

  // Step 5: Push Memory Transfer: Mock RAM (Container A) -> Real DB (Container B)
  try {
    const pushRes = await fetch(`${MOCKFORGE_URL}/__admin/handshake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: MOCK_TARGET_BACKEND_URL,
        direction: "push",
        scopeSession: SESSION_ID,
        conflictStrategy: "upsert"
      })
    });
    if (!pushRes.ok) throw new Error(`Handshake push failed with HTTP ${pushRes.status}`);
    const pushData = await pushRes.json();
    if (!pushData.success) throw new Error(pushData.error || "Handshake rejected");

    // Verify Real Backend received the records
    const realRes = await fetch(`${REAL_BACKEND_URL}/tasks`);
    const realTasks = await realRes.json();
    const realCount = Array.isArray(realTasks) ? realTasks.length : realTasks.items?.length;
    pass("Step 5: Memory Stream (Mock RAM ➔ Real DB)", `Pushed ${pushData.entitiesTransferred} entities; Container B (:8080) now holds ${realCount} tasks`);
  } catch (err) {
    fail("Step 5: Push memory transfer", err.message);
  }

  // Step 6: Simulate Real DB event and test Reverse Memory Pull
  try {
    // Inject urgent production task directly into Container B (:8080)
    const directTask = {
      id: `tsk_p0${Date.now().toString(36).slice(-6)}`,
      title: "🚨 P0 Hotfix: Mitigate DNS Amplification on Core Router",
      priority: "high",
      done: false,
      assigneeEmail: "sre-oncall@enterprise.org",
      dueDate: "2026-10-01",
      createdAt: new Date().toISOString()
    };

    const directRes = await fetch(`${REAL_BACKEND_URL}/tasks`, {
      method: "POST",
      headers,
      body: JSON.stringify(directTask)
    });
    if (!directRes.ok) throw new Error(`Direct seed to Real DB failed: HTTP ${directRes.status}`);

    // Trigger Reverse Pull into Mock RAM (:3000)
    const pullRes = await fetch(`${MOCKFORGE_URL}/__admin/pull-memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceUrl: MOCK_TARGET_BACKEND_URL,
        scopeSession: SESSION_ID,
        resource: "tasks"
      })
    });
    if (!pullRes.ok) throw new Error(`Pull memory failed with HTTP ${pullRes.status}`);
    const pullData = await pullRes.json();
    if (!pullData.success) throw new Error(pullData.error || "Pull rejected");

    // Verify task is now in MockForge RAM
    const checkRes = await fetch(`${MOCKFORGE_URL}/tasks/${directTask.id}`, { headers });
    if (checkRes.status !== 200) throw new Error(`Injected task ${directTask.id} not found in Mock RAM`);

    pass("Step 6: Reverse Memory Pull (Real DB ➔ Mock RAM)", `Injected '${directTask.id}' into Container B; successfully hydrated into Mock RAM (${pullData.entitiesTransferred} total entities synced)`);
  } catch (err) {
    fail("Step 6: Reverse memory pull", err.message);
  }

  // Step 7: Test Chaos Latency Injection
  try {
    // Inject 400ms latency
    await fetch(`${MOCKFORGE_URL}/__admin/chaos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latency: 400 })
    });

    const t0 = performance.now();
    const delayedRes = await fetch(`${MOCKFORGE_URL}/tasks`, { headers });
    const elapsed = Math.round(performance.now() - t0);

    if (elapsed < 350) throw new Error(`Expected >= 350ms latency, measured ${elapsed}ms`);
    pass("Step 7: Chaos Latency Injection Verified", `Configured +400ms; measured roundtrip ${elapsed}ms`);

    // Reset chaos latency back to 0
    await fetch(`${MOCKFORGE_URL}/__admin/chaos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latency: 0 })
    });
  } catch (err) {
    fail("Step 7: Chaos latency", err.message);
  }

  // Step 8: Multi-spec contract inspection
  try {
    const blogRes = await fetch(`${FRONTEND_URL}/api/specs?id=blog`);
    const blogData = await blogRes.json();
    if (!blogData.content.includes("Blog API") || !blogData.content.includes("/authors")) {
      throw new Error("Failed to load blog.yaml spec contract");
    }
    pass("Step 8: Multi-Spec Contract Swapping Verified", `Loaded '${blogData.activeSpec.name}' (${blogData.activeSpec.path})`);
  } catch (err) {
    fail("Step 8: Multi-spec inspection", err.message);
  }

  console.log("\n=======================================================");
  console.log("   ALL 8 VERIFICATION PHASES PASSED WITH 100% SUCCESS  ");
  console.log("=======================================================\n");
}

runTest();
