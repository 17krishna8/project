// a05 - CRUD (phase 4)
// Proves B1.2 (stateful in-memory CRUD) and the B2 behaviour rules: 201 with
// the stored record, 404 for unknown ids, 204 on delete, X-Total-Count,
// filtering, pagination, sorting and client-supplied ids.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { request, sessionHeader } from "../helpers/http.js";
import { fixture, startMockForge, type StartedServer } from "../helpers/server.js";

let server: StartedServer;
const SESSION = "a05";

async function createUser(overrides: Record<string, unknown> = {}, session = SESSION) {
  const res = await request(server.baseUrl, "POST", "/users", {
    headers: sessionHeader(session),
    body: { name: "Meera Nair", email: "meera.nair@example.in", ...overrides }
  });
  expect(res.status).toBe(201);
  return res.body as Record<string, any>;
}

describe("a05 CRUD", () => {
  beforeAll(async () => {
    server = await startMockForge(fixture("users.yaml"));
  }, 30_000);

  afterAll(async () => {
    await server.stop();
  });

  it("a05.1 create returns 201 with the stored record, including generated fields", async () => {
    const user = await createUser();
    expect(user.name).toBe("Meera Nair");
    expect(user.email).toBe("meera.nair@example.in");
    expect(typeof user.id).toBe("string");
    expect(typeof user.phone).toBe("string");
    expect(typeof user.balance).toBe("number");
    expect(typeof user.createdAt).toBe("string");
  });

  it("a05.2 a later read returns exactly the record that was created", async () => {
    const created = await createUser({ name: "Read Back", email: "read.back@example.in", balance: 1234.56 });
    const res = await request(server.baseUrl, "GET", `/users/${created.id}`, { headers: sessionHeader(SESSION) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it("a05.3 PUT replaces the record", async () => {
    const created = await createUser({ name: "Before Put", email: "before.put@example.in", balance: 10 });
    const res = await request(server.baseUrl, "PUT", `/users/${created.id}`, {
      headers: sessionHeader(SESSION),
      body: { name: "After Put", email: "after.put@example.in", balance: 99.5, status: "blocked" }
    });
    expect(res.status).toBe(200);
    const updated = res.body as Record<string, any>;
    expect(updated.name).toBe("After Put");
    expect(updated.balance).toBe(99.5);
    expect(updated.status).toBe("blocked");

    const read = await request(server.baseUrl, "GET", `/users/${created.id}`, { headers: sessionHeader(SESSION) });
    expect((read.body as Record<string, any>).name).toBe("After Put");
  });

  it("a05.4 PATCH merges the record and leaves other fields intact", async () => {
    const created = await createUser({ name: "Patch Target", email: "patch.target@example.in", balance: 5 });
    const res = await request(server.baseUrl, "PATCH", `/users/${created.id}`, {
      headers: sessionHeader(SESSION),
      body: { balance: 777.25 }
    });
    expect(res.status).toBe(200);
    const patched = res.body as Record<string, any>;
    expect(patched.balance).toBe(777.25);
    expect(patched.name).toBe("Patch Target");
    expect(patched.email).toBe("patch.target@example.in");
    expect(patched.id).toBe(created.id);
  });

  it("a05.5 delete returns 204 and the record is gone", async () => {
    const created = await createUser({ name: "Delete Me", email: "delete.me@example.in" });
    const del = await request(server.baseUrl, "DELETE", `/users/${created.id}`, { headers: sessionHeader(SESSION) });
    expect(del.status).toBe(204);
    const read = await request(server.baseUrl, "GET", `/users/${created.id}`, { headers: sessionHeader(SESSION) });
    expect(read.status).toBe(404);
    const body = read.body as { error?: { code?: string } };
    expect(body.error?.code).toBeTruthy();
  });

  it("a05.6 list returns an array with X-Total-Count", async () => {
    const before = Number(
      (await request(server.baseUrl, "GET", "/users?limit=1", { headers: sessionHeader(SESSION) })).headers.get("x-total-count")
    );
    await createUser({ name: "Counted One", email: "counted.one@example.in" });
    const after = await request(server.baseUrl, "GET", "/users", { headers: sessionHeader(SESSION) });
    expect(Array.isArray(after.body)).toBe(true);
    expect(Number(after.headers.get("x-total-count"))).toBe(before + 1);
  });

  it("a05.7 equality filters only return matching records", async () => {
    await createUser({ name: "Filter Active", email: "filter.active@example.in", status: "active" });
    await createUser({ name: "Filter Blocked", email: "filter.blocked@example.in", status: "blocked" });
    const res = await request(server.baseUrl, "GET", "/users?status=blocked&limit=100", { headers: sessionHeader(SESSION) });
    expect(res.status).toBe(200);
    const users = res.body as Array<Record<string, any>>;
    expect(users.length).toBeGreaterThan(0);
    for (const user of users) expect(user.status).toBe("blocked");
  });

  it("a05.8 limit, offset and page paginate the same list", async () => {
    const first = await request(server.baseUrl, "GET", "/users?limit=2&offset=0&sort=createdAt&order=asc", {
      headers: sessionHeader(SESSION)
    });
    expect((first.body as unknown[]).length).toBe(2);
    const second = await request(server.baseUrl, "GET", "/users?limit=2&offset=2&sort=createdAt&order=asc", {
      headers: sessionHeader(SESSION)
    });
    const paged = await request(server.baseUrl, "GET", "/users?limit=2&page=2&sort=createdAt&order=asc", {
      headers: sessionHeader(SESSION)
    });
    expect((second.body as unknown[]).length).toBe(2);
    expect(paged.body).toEqual(second.body);
    const ids1 = (first.body as Array<{ id: string }>).map((u) => u.id);
    const ids2 = (second.body as Array<{ id: string }>).map((u) => u.id);
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  it("a05.9 sort and order change the result order", async () => {
    const asc = await request(server.baseUrl, "GET", "/users?sort=balance&order=asc&limit=100", {
      headers: sessionHeader(SESSION)
    });
    const desc = await request(server.baseUrl, "GET", "/users?sort=balance&order=desc&limit=100", {
      headers: sessionHeader(SESSION)
    });
    const ascBalances = (asc.body as Array<{ balance: number }>).map((u) => Number(u.balance));
    const descBalances = (desc.body as Array<{ balance: number }>).map((u) => Number(u.balance));
    const sortedAsc = [...ascBalances].sort((a, b) => a - b);
    const sortedDesc = [...descBalances].sort((a, b) => b - a);
    expect(ascBalances).toEqual(sortedAsc);
    expect(descBalances).toEqual(sortedDesc);
  });

  it("a05.10 a client-supplied id is honoured", async () => {
    const res = await request(server.baseUrl, "POST", "/users", {
      headers: sessionHeader(SESSION),
      body: { id: "usr_client_supplied", name: "Client Supplied", email: "client.supplied@example.in" }
    });
    expect(res.status).toBe(201);
    expect((res.body as Record<string, any>).id).toBe("usr_client_supplied");
    const read = await request(server.baseUrl, "GET", "/users/usr_client_supplied", { headers: sessionHeader(SESSION) });
    expect(read.status).toBe(200);
    expect((read.body as Record<string, any>).name).toBe("Client Supplied");
  });
});
