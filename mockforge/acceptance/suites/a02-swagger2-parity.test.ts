// a02 - swagger2 parity (phase 2)
// Proves B1 ("OpenAPI 3.0 or Swagger 2.0") and B2: the Swagger 2.0 fixture
// behaves exactly like its OpenAPI 3 twin.
import { afterAll, describe, expect, it } from "vitest";
import { request } from "../helpers/http.js";
import { fixture, startMockForge, type StartedServer } from "../helpers/server.js";

let v3: StartedServer;
let v2: StartedServer;

async function routeTable(server: StartedServer): Promise<string[]> {
  const res = await request<Array<{ method: string; path: string; kind: string; resource: string | null }>>(
    server.baseUrl,
    "GET",
    "/__admin/routes"
  );
  expect(res.status).toBe(200);
  return (res.body as Array<{ method: string; path: string }>)
    .map((r) => `${r.method} ${r.path}`)
    .sort();
}

describe("a02 swagger2 parity", () => {
  afterAll(async () => {
    await v2?.stop();
    await v3?.stop();
  });

  it("a02.1 the Swagger 2.0 users twin exposes the same routes as the OpenAPI 3 twin", async () => {
    v3 = await startMockForge(fixture("users.yaml"));
    v2 = await startMockForge(fixture("users.swagger2.yaml"));
    expect(await routeTable(v2)).toEqual(await routeTable(v3));
  });

  it("a02.2 the Swagger 2.0 twin performs the same CRUD flow", async () => {
    const list = await request(v2.baseUrl, "GET", "/users");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);

    const created = await request(v2.baseUrl, "POST", "/users", {
      headers: { "x-session-id": "a02-2" },
      body: { name: "Vikram Iyer", email: "vikram.iyer@example.in", status: "active", balance: 500 }
    });
    expect(created.status).toBe(201);
    const id = (created.body as Record<string, unknown>).id as string;
    expect(typeof id).toBe("string");

    const read = await request(v2.baseUrl, "GET", `/users/${id}`, { headers: { "x-session-id": "a02-2" } });
    expect(read.status).toBe(200);
    expect((read.body as Record<string, unknown>).name).toBe("Vikram Iyer");

    expect((await request(v2.baseUrl, "DELETE", `/users/${id}`, { headers: { "x-session-id": "a02-2" } })).status).toBe(204);
    expect((await request(v2.baseUrl, "GET", `/users/${id}`, { headers: { "x-session-id": "a02-2" } })).status).toBe(404);
  });

  it("a02.3 the Swagger 2.0 petstore twin exposes the same routes as its OpenAPI 3 twin", async () => {
    const petV3 = await startMockForge(fixture("petstore.yaml"));
    const petV2 = await startMockForge(fixture("petstore.swagger2.yaml"));
    try {
      expect(await routeTable(petV2)).toEqual(await routeTable(petV3));
    } finally {
      await petV3.stop();
      await petV2.stop();
    }
  });
});
