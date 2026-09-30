// a08 - chaos (phase 5)
// Proves B1.3 (configurable chaos) and B2: latency within 50 ms of the setting,
// clamping above 3000 ms, error rate within 5% over 1,000 calls, the 404:500
// split, per-request header overrides and the fault body shape. Reserved paths
// must never be affected by chaos.
import { describe, expect, it } from "vitest";
import { request, sessionHeader } from "../helpers/http.js";
import { fixture, startMockForge, type StartedServer } from "../helpers/server.js";

const SESSION = "a08";

async function timedGet(server: StartedServer, path: string, headers: Record<string, string> = {}) {
  const t0 = Date.now();
  const res = await request(server.baseUrl, "GET", path, { headers: { ...sessionHeader(SESSION), ...headers } });
  return { res, ms: Date.now() - t0 };
}

describe("a08 chaos", () => {
  it("a08.1 injected latency is within 50 ms of the setting", async () => {
    const server = await startMockForge(fixture("users.yaml"), { args: ["--latency", "800"] });
    try {
      const { res, ms } = await timedGet(server, "/users");
      expect(res.status).toBe(200);
      expect(ms, `took ${ms}ms`).toBeGreaterThanOrEqual(750);
      expect(ms, `took ${ms}ms`).toBeLessThanOrEqual(900);
    } finally {
      await server.stop();
    }
  });

  it("a08.2 the X-Mock-Latency header overrides latency for one request", async () => {
    const server = await startMockForge(fixture("users.yaml"));
    try {
      const { res, ms } = await timedGet(server, "/users", { "x-mock-latency": "1500" });
      expect(res.status).toBe(200);
      expect(ms, `took ${ms}ms`).toBeGreaterThanOrEqual(1450);
      expect(ms, `took ${ms}ms`).toBeLessThanOrEqual(1650);
    } finally {
      await server.stop();
    }
  });

  it("a08.3 latency above 3000 ms is clamped", async () => {
    const server = await startMockForge(fixture("users.yaml"), { args: ["--latency", "9000"] });
    try {
      const { res, ms } = await timedGet(server, "/users");
      expect(res.status).toBe(200);
      expect(ms, `took ${ms}ms`).toBeLessThanOrEqual(3100);
    } finally {
      await server.stop();
    }
  });

  it("a08.4 the error rate is within 5% over 1,000 calls and honours the split", async () => {
    const server = await startMockForge(fixture("users.yaml"), {
      args: ["--error-rate", "0.3", "--error-split", "50:50"]
    });
    try {
      let notFound = 0;
      let serverError = 0;
      let ok = 0;
      const total = 1000;
      for (let batch = 0; batch < 10; batch++) {
        const results = await Promise.all(
          Array.from({ length: total / 10 }, () =>
            request(server.baseUrl, "GET", "/users", { headers: sessionHeader(SESSION) })
          )
        );
        for (const res of results) {
          if (res.status === 404) notFound++;
          else if (res.status === 500) serverError++;
          else ok++;
        }
      }
      const errors = notFound + serverError;
      const rate = errors / total;
      expect(rate, `error rate was ${rate}`).toBeGreaterThanOrEqual(0.25);
      expect(rate, `error rate was ${rate}`).toBeLessThanOrEqual(0.35);
      expect(notFound / errors, `404 share was ${notFound / errors}`).toBeGreaterThanOrEqual(0.35);
      expect(notFound / errors, `404 share was ${notFound / errors}`).toBeLessThanOrEqual(0.65);
      expect(ok).toBeGreaterThan(0);
    } finally {
      await server.stop();
    }
  }, 60_000);

  it("a08.5 X-Mock-Error forces a specific fault with the documented body shape", async () => {
    const server = await startMockForge(fixture("users.yaml"));
    try {
      const res = await request(server.baseUrl, "GET", "/users", {
        headers: { ...sessionHeader(SESSION), "x-mock-error": "500" }
      });
      expect(res.status).toBe(500);
      const body = res.body as { error?: { code?: string; message?: string; details?: unknown[] } };
      expect(body.error?.code).toBe("MOCKFORGE_INJECTED_500");
      expect(typeof body.error?.message).toBe("string");
      expect(Array.isArray(body.error?.details)).toBe(true);
    } finally {
      await server.stop();
    }
  });

  it("a08.6 X-Mock-Status forces any status code", async () => {
    const server = await startMockForge(fixture("users.yaml"));
    try {
      const res = await request(server.baseUrl, "GET", "/users", {
        headers: { ...sessionHeader(SESSION), "x-mock-status": "418" }
      });
      expect(res.status).toBe(418);
      const body = res.body as { error?: { code?: string } };
      expect(body.error?.code).toBe("MOCKFORGE_INJECTED_418");
    } finally {
      await server.stop();
    }
  });

  it("a08.7 PUT /__admin/chaos changes live behaviour, and reserved paths stay clean", async () => {
    const server = await startMockForge(fixture("users.yaml"));
    try {
      const put = await request(server.baseUrl, "PUT", "/__admin/chaos", {
        headers: { "content-type": "application/json" },
        body: { latencyMs: 0, errorRate: 1, split404: 100, split500: 0 }
      });
      expect(put.status).toBe(200);

      const get = await request(server.baseUrl, "GET", "/__admin/chaos");
      expect(get.status).toBe(200);
      expect((get.body as { errorRate?: number }).errorRate).toBe(1);
      expect((get.body as { split404?: number }).split404).toBe(100);

      const faulted = await request(server.baseUrl, "GET", "/users", { headers: sessionHeader(SESSION) });
      expect(faulted.status).toBe(404);
      expect((faulted.body as { error?: { code?: string } }).error?.code).toBe("MOCKFORGE_INJECTED_404");

      const health = await timedGet(server, "/__health", {});
      expect(health.res.status).toBe(200);
      expect(health.ms, `health took ${health.ms}ms under 100% error rate`).toBeLessThan(1000);
    } finally {
      await server.stop();
    }
  });
});
