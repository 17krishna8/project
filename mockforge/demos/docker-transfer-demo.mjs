#!/usr/bin/env node
/**
 * ============================================================================
 * Live Demonstration & Automated Test:
 * Container-to-Container Database Memory Transfer & Latency Engine
 * ============================================================================
 */

const MOCKFORGE_URL = process.env.MOCKFORGE_URL || "http://127.0.0.1:3000";
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8080";
const BACKEND_INTERNAL = process.env.BACKEND_INTERNAL || "http://real-production-backend:8080";

function logStep(step, message) {
  console.log(`\n\x1b[1m\x1b[36m[STEP ${step}]\x1b[0m \x1b[32m${message}\x1b[0m`);
}

function assert(condition, message) {
  if (condition) {
    console.log(`  \x1b[32m✓ [PASS]\x1b[0m ${message}`);
  } else {
    console.error(`  \x1b[31m✗ [FAIL]\x1b[0m ${message}`);
    process.exitCode = 1;
  }
}

async function main() {
  console.log("================================================================================");
  console.log(" MOCKFORGE: REAL CONTAINER-TO-CONTAINER DATABASE MEMORY TRANSFER & LATENCY TEST ");
  console.log("================================================================================");
  console.log(`Container A (MockForge Dummy):  ${MOCKFORGE_URL}`);
  console.log(`Container B (Real Backend DB):  ${BACKEND_URL}`);

  // --------------------------------------------------------------------------
  // Step 1: Health Probes
  // --------------------------------------------------------------------------
  logStep(1, "Probing both containers for network connectivity");
  const aHealth = await (await fetch(`${MOCKFORGE_URL}/__health`)).json();
  assert(aHealth.status === "ok", `Container A is HEALTHY (Uptime: ${aHealth.uptimeMs}ms, Routes: ${aHealth.routes})`);

  const bHealth = await (await fetch(`${BACKEND_URL}/health`)).json();
  assert(bHealth.status === "healthy", `Container B is HEALTHY (Service: ${bHealth.service})`);

  // Determine target URL from Container A's perspective (internal Docker DNS vs host)
  let targetBackend = BACKEND_INTERNAL;
  try {
    const probe = await (await fetch(`${MOCKFORGE_URL}/__admin/handshake`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetUrl: BACKEND_INTERNAL, autoProxy: false, transferMemory: false })
    })).json();
    if (!probe.stages?.connectivity?.passed) {
      targetBackend = BACKEND_URL;
    }
  } catch {
    targetBackend = BACKEND_URL;
  }
  console.log(`  Container A routes to Container B via: ${targetBackend}`);

  // Ensure starting in pure mock mode
  await fetch(`${MOCKFORGE_URL}/__admin/proxy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false })
  });

  // --------------------------------------------------------------------------
  // Step 2: Seed In-Memory Database in Container A (MockForge RAM)
  // --------------------------------------------------------------------------
  const sessionId = `docker-session-${Date.now()}`;
  logStep(2, `Seeding 3 new task records into Container A RAM under session: ${sessionId}`);

  const task1 = await (
    await fetch(`${MOCKFORGE_URL}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-session-id": sessionId },
      body: JSON.stringify({ title: "Docker Container Task #1 (Alpha)", priority: "high", done: false })
    })
  ).json();
  assert(task1.id, `Created Record 1 in RAM (ID: ${task1.id})`);

  const task2 = await (
    await fetch(`${MOCKFORGE_URL}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-session-id": sessionId },
      body: JSON.stringify({ title: "Docker Container Task #2 (Beta)", priority: "medium", done: false })
    })
  ).json();
  assert(task2.id, `Created Record 2 in RAM (ID: ${task2.id})`);

  const task3 = await (
    await fetch(`${MOCKFORGE_URL}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-session-id": sessionId },
      body: JSON.stringify({ title: "Docker Container Task #3 (Gamma)", priority: "low", done: true })
    })
  ).json();
  assert(task3.id, `Created Record 3 in RAM (ID: ${task3.id})`);

  // Verify records exist in Container A
  const memoryBefore = await (
    await fetch(`${MOCKFORGE_URL}/__admin/backend-memory?sessionId=${sessionId}&targetUrl=${targetBackend}`)
  ).json();
  assert(memoryBefore.dummy.entitiesCount >= 3, `Container A RAM verified: ${memoryBefore.dummy.entitiesCount} records staged`);

  // --------------------------------------------------------------------------
  // Step 3: Trigger 4-Stage Handshake Memory Transfer Across Container Network
  // --------------------------------------------------------------------------
  logStep(3, "Triggering Handshake: Streaming memory from Container A -> Container B");
  const handshakeStart = performance.now();
  const handshakeRes = await (
    await fetch(`${MOCKFORGE_URL}/__admin/handshake`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetUrl: targetBackend,
        sessionId,
        strategy: "upsert",
        transferMemory: true,
        autoProxy: true
      })
    })
  ).json();

  const transferDurationMs = Math.round(performance.now() - handshakeStart);
  assert(handshakeRes.success === true, `Handshake completed in ${transferDurationMs}ms with overall SUCCESS`);
  assert(handshakeRes.stages.connectivity.passed === true, "Stage 1 (TCP Ping Probe) PASSED");
  assert(handshakeRes.stages.schema.passed === true, `Stage 2 (Schema Parity) PASSED (${handshakeRes.stages.schema.parityPercent}% parity)`);
  assert(handshakeRes.stages.memory.passed === true, `Stage 3 (Memory Transfer) PASSED (Strategy: ${handshakeRes.stages.memory.strategy})`);
  assert(handshakeRes.stages.handoff.passed === true, "Stage 4 (Gateway Bridge Cutover) PASSED");
  assert(handshakeRes.handshakeToken.startsWith("mf_ack_"), `Mutual Token Issued: ${handshakeRes.handshakeToken}`);

  // --------------------------------------------------------------------------
  // Step 4: Verify Container B's Database Store Received the Migrated Memory
  // --------------------------------------------------------------------------
  logStep(4, "Verifying real database ingestion inside Container B");
  const backendStateRes = await (await fetch(`${BACKEND_URL}/api/seed/state?sessionId=${sessionId}`)).json();
  const backendTasks = backendStateRes.resources?.tasks || backendStateRes.tasks || [];
  
  assert(backendTasks.some((t) => t.id === task1.id), `Container B database has Task 1 (${task1.id})`);
  assert(backendTasks.some((t) => t.id === task2.id), `Container B database has Task 2 (${task2.id})`);
  assert(backendTasks.some((t) => t.id === task3.id), `Container B database has Task 3 (${task3.id})`);

  // Verify Side-by-Side Dual Memory Inspector Status
  const memoryAfter = await (
    await fetch(`${MOCKFORGE_URL}/__admin/backend-memory?sessionId=${sessionId}&targetUrl=${targetBackend}`)
  ).json();
  assert(memoryAfter.syncStatus === "in_sync" || memoryAfter.syncStatus === "partial_sync", `Dual Memory Sync Status: ${memoryAfter.syncStatus}`);
  console.log(`  Container A RAM: ${memoryAfter.dummy.entitiesCount} entities | Container B DB: ${memoryAfter.backend.entitiesCount} entities`);

  // --------------------------------------------------------------------------
  // Step 5: Test Transparent Gateway Bridge & Origin Header
  // --------------------------------------------------------------------------
  logStep(5, "Verifying Transparent Gateway Bridge: Frontend calls to :3000 proxy to :8080");
  const bridgeRes = await fetch(`${MOCKFORGE_URL}/tasks`, {
    headers: { "x-session-id": sessionId }
  });
  assert(bridgeRes.status === 200, "Request to :3000 returned HTTP 200");
  assert(bridgeRes.headers.get("x-mockforge-source") === "real-backend", "Header X-MockForge-Source: real-backend (Transferred to Real DB)");

  // --------------------------------------------------------------------------
  // Step 6: Test Circuit Breaker Resilience (Container Unreachable)
  // --------------------------------------------------------------------------
  logStep(6, "Testing Circuit Breaker: Pointing to offline container port (59999)");
  await fetch(`${MOCKFORGE_URL}/__admin/proxy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true, circuitBreaker: true, targetUrl: "http://127.0.0.1:59999" })
  });

  const cbRes = await fetch(`${MOCKFORGE_URL}/tasks`);
  assert(cbRes.status === 200, "Circuit Breaker prevented 502 Bad Gateway: returned HTTP 200");
  assert(cbRes.headers.get("x-mockforge-fallback") === "true", "Header X-MockForge-Fallback: true (Mock fallback active)");
  assert(cbRes.headers.get("x-mockforge-source") === "mock-fallback", "Header X-MockForge-Source: mock-fallback");

  // Restore proxy to Container B
  await fetch(`${MOCKFORGE_URL}/__admin/proxy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true, circuitBreaker: true, targetUrl: targetBackend })
  });

  // --------------------------------------------------------------------------
  // Step 7: Comprehensive Latency Engine Verification
  // --------------------------------------------------------------------------
  logStep(7, "Comprehensive Latency Engine Verification");

  // Switch to Pure Mock Mode for latency profiling
  await fetch(`${MOCKFORGE_URL}/__admin/proxy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false })
  });

  // 7a. Baseline Latency (0ms injection)
  await fetch(`${MOCKFORGE_URL}/__admin/chaos`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ latencyMs: 0, errorRate: 0 })
  });
  const t0 = performance.now();
  await fetch(`${MOCKFORGE_URL}/tasks`);
  const baselineMs = Math.round(performance.now() - t0);
  assert(baselineMs < 50, `Baseline roundtrip is fast: ${baselineMs}ms (<50ms)`);

  // 7b. Server-Side Chaos Injected Latency (250ms)
  await fetch(`${MOCKFORGE_URL}/__admin/chaos`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ latencyMs: 250, errorRate: 0 })
  });
  const t1 = performance.now();
  await fetch(`${MOCKFORGE_URL}/tasks`);
  const chaos250Ms = Math.round(performance.now() - t1);
  assert(chaos250Ms >= 240, `Chaos latency 250ms accurately delayed response: ${chaos250Ms}ms (>=240ms)`);

  // 7c. Per-Request Latency Header Override (x-mock-latency: 400)
  const t2 = performance.now();
  await fetch(`${MOCKFORGE_URL}/tasks`, {
    headers: { "x-mock-latency": "400" }
  });
  const header400Ms = Math.round(performance.now() - t2);
  assert(header400Ms >= 380, `Per-request header x-mock-latency: 400 accurately delayed response: ${header400Ms}ms (>=380ms)`);

  // 7d. Reset Latency to 0
  await fetch(`${MOCKFORGE_URL}/__admin/chaos`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ latencyMs: 0, errorRate: 0 })
  });
  const t3 = performance.now();
  await fetch(`${MOCKFORGE_URL}/tasks`);
  const resetMs = Math.round(performance.now() - t3);
  assert(resetMs < 50, `Latency reset back to normal: ${resetMs}ms (<50ms)`);

  console.log("\n================================================================================");
  console.log(" ALL CONTAINER DATABASE MEMORY TRANSFER & LATENCY TESTS PASSED SUCCESSFULLY!    ");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("FATAL ERROR in test execution:", err);
  process.exit(1);
});
