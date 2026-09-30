import http from "node:http";
import crypto from "node:crypto";

const PORT = parseInt(process.env.PORT || "8085", 10);
const HOST = "0.0.0.0";

// In-Memory Database Store for Container/Backend
const db = {
  products: [
    {
      id: "prod_k8s01",
      name: "Ultra-Wide 4K Gaming Monitor 144Hz",
      category: "computing",
      price: 549.99,
      stock: 35,
      rating: 4.8,
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
    },
    {
      id: "prod_k8s02",
      name: "Tactile Mechanical Keyboard RGB",
      category: "computing",
      price: 139.50,
      stock: 80,
      rating: 4.9,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      id: "prod_k8s03",
      name: "Studio Noise-Cancelling ANC Headphones",
      category: "audio",
      price: 279.00,
      stock: 45,
      rating: 4.7,
      createdAt: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: "prod_k8s04",
      name: "Ergonomic Mesh Desk Chair Pro",
      category: "electronics",
      price: 389.00,
      stock: 20,
      rating: 4.6,
      createdAt: new Date().toISOString()
    }
  ],
  orders: [
    {
      id: "ord_ecom01",
      customerName: "Aarav Sundaram",
      customerEmail: "aarav.sundaram@techindia.org",
      totalAmount: 689.49,
      status: "processing",
      itemsCount: 2,
      shippingCity: "Bengaluru",
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString()
    },
    {
      id: "ord_ecom02",
      customerName: "Meera Krishnan",
      customerEmail: "meera.k@chennai-cloud.io",
      totalAmount: 279.00,
      status: "shipped",
      itemsCount: 1,
      shippingCity: "Chennai",
      createdAt: new Date(Date.now() - 3600000 * 12).toISOString()
    },
    {
      id: "ord_ecom03",
      customerName: "Rohan Varma",
      customerEmail: "rohan.v@mumbai-fintech.net",
      totalAmount: 139.50,
      status: "delivered",
      itemsCount: 1,
      shippingCity: "Mumbai",
      createdAt: new Date(Date.now() - 3600000 * 28).toISOString()
    }
  ]
};

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  // Helper to read JSON request body
  const readBody = () => new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => raw += chunk);
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });

  // 1. Health
  if (pathname === "/health" || pathname === "/__health") {
    return sendJson(res, 200, {
      status: "ok",
      server: "Standalone Real Production Backend",
      port: PORT,
      productsCount: db.products.length,
      ordersCount: db.orders.length,
      timestamp: new Date().toISOString()
    });
  }

  // 2. Dump Memory (for testing cutover / memory transfer from MockForge)
  if (pathname === "/api/dump-memory" && method === "GET") {
    return sendJson(res, 200, {
      database: "Real Production DB",
      entitiesCount: db.products.length + db.orders.length,
      data: db
    });
  }

  // 3. Sync Memory (import from MockForge RAM)
  if (pathname === "/api/sync-memory" && method === "POST") {
    readBody().then(body => {
      let imported = 0;
      if (body.products && Array.isArray(body.products)) {
        for (const p of body.products) {
          const idx = db.products.findIndex(x => x.id === p.id);
          if (idx >= 0) db.products[idx] = p;
          else db.products.push(p);
          imported++;
        }
      }
      if (body.orders && Array.isArray(body.orders)) {
        for (const o of body.orders) {
          const idx = db.orders.findIndex(x => x.id === o.id);
          if (idx >= 0) db.orders[idx] = o;
          else db.orders.push(o);
          imported++;
        }
      }
      return sendJson(res, 200, {
        success: true,
        importedCount: imported,
        currentTotal: db.products.length + db.orders.length
      });
    }).catch(err => sendJson(res, 400, { error: err.message }));
    return;
  }

  // 4. Products: GET /products
  if (pathname === "/products" && method === "GET") {
    const category = url.searchParams.get("category");
    let result = db.products;
    if (category) {
      result = result.filter(p => p.category.toLowerCase() === category.toLowerCase());
    }
    return sendJson(res, 200, result);
  }

  // 5. Products: POST /products
  if (pathname === "/products" && method === "POST") {
    readBody().then(body => {
      if (!body.name || !body.price) {
        return sendJson(res, 400, { error: "Missing required fields: name, price" });
      }
      const newProduct = {
        id: body.id || `prod_${crypto.randomBytes(3).toString("hex")}`,
        name: body.name,
        category: body.category || "electronics",
        price: parseFloat(body.price),
        stock: parseInt(body.stock || "10", 10),
        rating: 5.0,
        createdAt: new Date().toISOString()
      };
      db.products.unshift(newProduct);
      return sendJson(res, 201, newProduct);
    }).catch(err => sendJson(res, 400, { error: err.message }));
    return;
  }

  // 6. Products: GET /products/{productId}
  const productMatch = pathname.match(/^\/products\/([^/]+)$/);
  if (productMatch && method === "GET") {
    const pId = productMatch[1];
    const found = db.products.find(p => p.id === pId);
    if (!found) return sendJson(res, 404, { error: `Product ${pId} not found` });
    return sendJson(res, 200, found);
  }

  // 7. Products: PUT /products/{productId}
  if (productMatch && method === "PUT") {
    const pId = productMatch[1];
    const idx = db.products.findIndex(p => p.id === pId);
    if (idx < 0) return sendJson(res, 404, { error: `Product ${pId} not found` });

    readBody().then(body => {
      db.products[idx] = {
        ...db.products[idx],
        ...body,
        id: pId
      };
      return sendJson(res, 200, db.products[idx]);
    }).catch(err => sendJson(res, 400, { error: err.message }));
    return;
  }

  // 8. Products: DELETE /products/{productId}
  if (productMatch && method === "DELETE") {
    const pId = productMatch[1];
    const initialLen = db.products.length;
    db.products = db.products.filter(p => p.id !== pId);
    if (db.products.length === initialLen) {
      return sendJson(res, 404, { error: `Product ${pId} not found` });
    }
    return sendJson(res, 204, null);
  }

  // 9. Orders: GET /orders
  if (pathname === "/orders" && method === "GET") {
    const status = url.searchParams.get("status");
    let result = db.orders;
    if (status) {
      result = result.filter(o => o.status.toLowerCase() === status.toLowerCase());
    }
    return sendJson(res, 200, result);
  }

  // 10. Orders: POST /orders
  if (pathname === "/orders" && method === "POST") {
    readBody().then(body => {
      if (!body.customerName || !body.totalAmount) {
        return sendJson(res, 400, { error: "Missing required fields: customerName, totalAmount" });
      }
      const newOrder = {
        id: body.id || `ord_${crypto.randomBytes(3).toString("hex")}`,
        customerName: body.customerName,
        customerEmail: body.customerEmail || "customer@store.com",
        totalAmount: parseFloat(body.totalAmount),
        status: body.status || "pending",
        itemsCount: parseInt(body.itemsCount || "1", 10),
        shippingCity: body.shippingCity || "Mumbai",
        createdAt: new Date().toISOString()
      };
      db.orders.unshift(newOrder);
      return sendJson(res, 201, newOrder);
    }).catch(err => sendJson(res, 400, { error: err.message }));
    return;
  }

  // 11. Orders: GET /orders/{orderId}
  const orderMatch = pathname.match(/^\/orders\/([^/]+)$/);
  if (orderMatch && method === "GET") {
    const oId = orderMatch[1];
    const found = db.orders.find(o => o.id === oId);
    if (!found) return sendJson(res, 404, { error: `Order ${oId} not found` });
    return sendJson(res, 200, found);
  }

  // 12. Orders: PATCH /orders/{orderId}
  if (orderMatch && method === "PATCH") {
    const oId = orderMatch[1];
    const idx = db.orders.findIndex(o => o.id === oId);
    if (idx < 0) return sendJson(res, 404, { error: `Order ${oId} not found` });

    readBody().then(body => {
      db.orders[idx] = {
        ...db.orders[idx],
        ...body,
        id: oId
      };
      return sendJson(res, 200, db.orders[idx]);
    }).catch(err => sendJson(res, 400, { error: err.message }));
    return;
  }

  // 13. Orders: DELETE /orders/{orderId}
  if (orderMatch && method === "DELETE") {
    const oId = orderMatch[1];
    const initialLen = db.orders.length;
    db.orders = db.orders.filter(o => o.id !== oId);
    if (db.orders.length === initialLen) {
      return sendJson(res, 404, { error: `Order ${oId} not found` });
    }
    return sendJson(res, 204, null);
  }

  // Fallback 404
  sendJson(res, 404, { error: `Cannot ${method} ${pathname}` });
});

server.listen(PORT, HOST, () => {
  console.log(`[Real Production Backend] Running on http://${HOST}:${PORT}`);
  console.log(`[Real Production Backend] Seeded with ${db.products.length} products and ${db.orders.length} orders`);
});
