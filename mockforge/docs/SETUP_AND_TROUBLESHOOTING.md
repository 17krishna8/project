# MockForge Setup, Architecture & Troubleshooting Manual

This guide provides complete setup instructions, system architecture, core operational workflows, and step-by-step troubleshooting procedures for **MockForge** and its standalone testing suites.

---

## 1. System Architecture & Design

MockForge is designed with a **strict separation between specification parsing, in-memory state management, and HTTP transport**. The entire mocking engine runs in-process with zero external database dependencies.

```
                           +------------------------------------------+
                           |  Frontend Client / Web Application       |
                           |  - Test Dashboard (Port 5175)            |
                           |  - MockForge Admin UI (Port 3000/__ui)   |
                           |  - Curl / Postman / Automated Tests      |
                           +--------------------+---------------------+
                                                |
                                                | HTTP Requests
                                                v
+-----------------------------------------------------------------------------------------+
|  MockForge Core Engine (Port 3000)                                                      |
|                                                                                         |
|  +--------------------+    +-----------------------+    +----------------------------+  |
|  | OpenAPI / Swagger  |--->| Route Table Compiler  |--->| Schema Validator (Ajv)     |  |
|  | Loader & Parser    |    | Paths, Methods, Params|    | Request / Response checks  |  |
|  +--------------------+    +-----------------------+    +----------------------------+  |
|                                                                                         |
|  +--------------------+    +-----------------------+    +----------------------------+  |
|  | Semantic Field     |--->| Stateful RAM Store    |--->| Chaos & Latency Engine     |  |
|  | Generator (Faker)  |    | Per-Session CRUD (LRU)|    | Delay & Error Injection    |  |
|  +--------------------+    +-----------------------+    +----------------------------+  |
|                                                                                         |
|  +-----------------------------------------------------------------------------------+  |
|  | Fastify HTTP Gateway & Admin Surface                                              |  |
|  | - API Routes: /products, /orders, etc.                                            |  |
|  | - Reserved Admin: /__ui, /__health, /__admin/spec, /__admin/routes, /__admin/chaos|  |
|  +-----------------------------------------+-----------------------------------------+  |
+--------------------------------------------|--------------------------------------------+
                                             |
                      +----------------------+----------------------+
                      | (Optional Dual-Store Bridge / Proxy Mode)   |
                      v                                             v
+---------------------------------------------+   +---------------------------------------+
| Standalone Real Backend (Port 8085)         |   | Docker Real Backend (Port 8080)       |
| - Node.js REST API Server                   |   | - Production Container                |
| - Sync Endpoints: /api/sync-memory          |   | - Realistic Database Store            |
| - Export Endpoints: /api/dump-memory        |   | - Proxy Target for Cutover Testing    |
+---------------------------------------------+   +---------------------------------------+
```

### Port Allocation Map

| Port | Component | Tech Stack | Role |
| :--- | :--- | :--- | :--- |
| **`3000`** | **MockForge Gateway** | Fastify 5, Node.js | Dynamic mock API gateway, OpenAPI hot-reloader, and admin dashboard (`/__ui`) |
| **`5175`** | **Standalone Test Frontend** | Vanilla JS / CSS, HTML5 | Dedicated client dashboard for OpenAPI validation, dynamic endpoints, and telemetry |
| **`8085`** | **Standalone Real Backend** | Pure Node.js REST API | Real backend server for memory synchronization and dual-store parity testing |
| **`8080`** | **Docker Real Backend** | Node.js in Docker | Production container used in full Docker Compose cutover demos |
| **`5173`** | **MockForge React Dashboard**| React, Vite, Tailwind | Core frontend dashboard source during development (`apps/dashboard`) |

---

## 2. Working Workflow of the Project

### A. Spec Ingestion & Route Compilation
When MockForge boots or receives a new spec via `POST /__admin/spec`:
1. The **Loader** (`packages/core/src/spec/loader.ts`) validates the YAML/JSON document against OpenAPI 3.0.x / Swagger 2.0 rules, enforces size limits (max 5 MB), and resolves local `$ref` pointers.
2. The **Route Compiler** (`packages/core/src/spec/routes.ts`) parses every `paths:` definition, assigns HTTP verbs (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), identifies primary resource keys (e.g. `productId`, `orderId`), and binds Ajv validation schemas.
3. Routes become active immediately without server restart.

### B. Semantic Data Generation
Instead of returning lorem-ipsum placeholders, MockForge inspects property names and formats:
- `email` $\rightarrow$ Valid email address (`aarav@tech.org`)
- `price` / `amount` $\rightarrow$ Constrained decimal currency formatted to 2 places
- `status` $\rightarrow$ Randomly picks valid schema enum strings (e.g., `["pending", "processing", "shipped", "delivered"]`)
- `createdAt` $\rightarrow$ ISO-8601 UTC timestamp inside a bounded 2-year window

### C. Stateful In-Memory CRUD & Session Isolation
- Every caller can provide an `X-Session-Id` header (defaults to `default`).
- `POST /products` inserts a new record into that session's memory store.
- `GET /products` returns newly created items along with initial seeds.
- `GET /products/:id` retrieves the exact created object.
- `PUT` and `PATCH` update attributes in-place.
- `DELETE` removes the record and subsequent calls return `404 MOCKFORGE_NOT_FOUND`.

### D. Dual-Store Parity & Live Cutover
- In local development, the frontend can query MockForge (`:3000`) while the real backend (`:8085` or `:8080`) is under construction.
- The **Memory Bridge** allows pushing all mock-generated RAM entities to the real backend via `POST /api/sync-memory`, or pulling real records into MockForge via `GET /api/dump-memory`.
- Once the real backend is production-ready, MockForge's reverse proxy can be enabled via `POST /__admin/proxy` to transparently route all requests to the real backend with zero frontend code changes.

---

## 3. Quick Setup & Run Guide

### Option 1: Running the Complete Standalone Test Suite (Recommended)

This suite runs MockForge alongside the standalone test frontend and backend:

1. **Start MockForge Dummy Server**:
   ```bash
   node packages/cli/dist/index.js demos/standalone-test/ecommerce.yaml --port 3000
   ```
2. **Start the Standalone Real Backend** (in a separate terminal):
   ```bash
   node demos/standalone-test/backend/server.mjs
   ```
3. **Start the Standalone Test Frontend** (in a separate terminal):
   ```bash
   node demos/standalone-test/frontend/server.mjs
   ```
4. **Open in Browser**:
   - Test Frontend: [http://127.0.0.1:5175](http://127.0.0.1:5175)
   - MockForge Admin UI: [http://127.0.0.1:3000/__ui](http://127.0.0.1:3000/__ui)
   - Real Backend Health: [http://127.0.0.1:8085/health](http://127.0.0.1:8085/health)

---

### Option 2: Running with Docker Compose

Run the entire ecosystem inside isolated Docker containers:

```bash
docker compose up --build -d
```

Verify containers are healthy:
```bash
docker ps
```

---

## 4. Comprehensive Troubleshooting Guide

### Issue 1: `{"error":{"code":"MOCKFORGE_NOT_FOUND","message":"No route for GET /"}}`

#### Why It Happens
MockForge is a **REST API Gateway**, not a generic static file server. It dynamically registers routes defined in your OpenAPI specification (such as `/products`, `/orders`, `/users`). 
When you click `http://127.0.0.1:3000` in a browser, the browser sends an HTTP request for `GET /`. If the loaded OpenAPI YAML does not define a root `/` route, MockForge returns a standard `404 MOCKFORGE_NOT_FOUND`.

#### How to Resolve
1. **To view the MockForge Visual Dashboard**, open:
   ```
   http://127.0.0.1:3000/__ui
   ```
2. **To query your active API resources**, access the endpoints directly:
   ```
   http://127.0.0.1:3000/products
   http://127.0.0.1:3000/orders
   http://127.0.0.1:3000/__health
   ```
3. **To see the interactive test frontend**, open:
   ```
   http://127.0.0.1:5175
   ```
4. **Permanent Gateway Root**: The updated `ecommerce.yaml` and MockForge gateway now include a root `/` service discovery handler that returns a `200 OK` JSON directory with links to `/__ui`, `/products`, and `/orders`.

---

### Issue 2: Port Conflict (`EADDRINUSE`) on Port 3000, 8085, or 5175

#### Why It Happens
Another Node.js process, Docker container, or background daemon is already listening on the requested port.

#### How to Resolve (Windows PowerShell)
1. Find the PID using the port:
   ```powershell
   Get-NetTCPConnection -LocalPort 3000, 8085, 5175 -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess
   ```
2. Terminate the process:
   ```powershell
   Stop-Process -Id <PID> -Force
   ```

#### How to Resolve (Linux / macOS)
```bash
lsof -i :3000 -t | xargs kill -9
```

---

### Issue 3: PowerShell Script Execution Policy (`npm.ps1 cannot be loaded`)

#### Why It Happens
Windows PowerShell default security policy restricts executing unsigned scripts like `npm.ps1`.

#### How to Resolve
Run commands through `cmd.exe`:
```powershell
cmd.exe /c "npm run test"
cmd.exe /c "npm run build"
```
Or allow local script execution in your PowerShell profile:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

---

### Issue 4: Docker Container Networking & Connection Refused

#### Why It Happens
Inside a Docker container, `localhost` or `127.0.0.1` refers to that specific container, not your host machine or peer containers.

#### How to Resolve
- When MockForge running in Docker needs to reach a service on your host machine, use `host.docker.internal` instead of `localhost`.
- When communicating between Docker Compose services, use the service name as the hostname:
  ```yaml
  REAL_BACKEND_URL: http://real-production-backend:8080
  ```

---

### Issue 5: Schema Validation Error (`400 MOCKFORGE_VALIDATION_ERROR`)

#### Why It Happens
A client sent a `POST`, `PUT`, or `PATCH` request with a payload that violates schema constraints defined in the YAML file (e.g. missing required field, invalid enum value, or string passed for a number).

#### How to Resolve
MockForge returns an error payload pointing to the exact violation:
```json
{
  "error": {
    "code": "MOCKFORGE_VALIDATION_ERROR",
    "message": "Request body does not match the schema for POST /products",
    "details": [{ "path": "/price", "reason": "must be number" }]
  }
}
```
Check your OpenAPI specification in `ecommerce.yaml` under `components/schemas/` to ensure request fields conform to types, required properties, and enums.

---

### Issue 6: Dual-Store Memory Parity Delta Mismatch

#### Why It Happens
MockForge stores items in RAM, while the Real Backend stores items in its database. When new items are added to one store without calling the sync bridge, a delta occurs.

#### How to Resolve
- In the Standalone Frontend ([http://127.0.0.1:5175](http://127.0.0.1:5175)):
  - Click **`➡️ Push Memory`** to push MockForge RAM items into the Real Backend database.
  - Click **`⬅️ Pull Memory`** to pull Real Backend items into MockForge.
  - The parity badge will immediately update to **`100% In Sync (0 Diff)`**.
