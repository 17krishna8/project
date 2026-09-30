#!/usr/bin/env node
/**
 * Generates big.yaml: 50 resources x 4 operations = 200 endpoints.
 * Usage: node gen-200-endpoints.mjs [outFile]
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "big.yaml"));
const resources = Array.from({ length: 50 }, (_, i) => `res${i}`);

const lines = [
  "openapi: 3.0.3",
  "info:",
  "  title: Big API",
  "  version: 1.0.0",
  "  description: 50 resources, 200 operations - boot-time fixture.",
  "paths:"
];

for (const name of resources) {
  const singular = name.replace(/s$/, "");
  lines.push(
    `  /${name}:`,
    "    get:",
    `      operationId: list${name}`,
    "      responses:",
    "        '200':",
    "          description: list",
    "          headers:",
    "            X-Total-Count:",
    "              description: total",
    "              schema:",
    "                type: integer",
    "          content:",
    "            application/json:",
    "              schema:",
    "                type: array",
    `                items:`,
    `                  $ref: '#/components/schemas/${singular}'`,
    "    post:",
    `      operationId: create${singular}`,
    "      requestBody:",
    "        required: true",
    "        content:",
    "          application/json:",
    "            schema:",
    `              $ref: '#/components/schemas/${singular}Create'`,
    "      responses:",
    "        '201':",
    "          description: created",
    "          content:",
    "            application/json:",
    "              schema:",
    `                $ref: '#/components/schemas/${singular}'`,
    `  /${name}/{id}:`,
    "    parameters:",
    "      - name: id",
    "        in: path",
    "        required: true",
    "        schema:",
    "          type: string",
    "          pattern: '^[A-Za-z0-9_-]{1,64}$'",
    "    get:",
    `      operationId: get${singular}`,
    "      responses:",
    "        '200':",
    "          description: one",
    "          content:",
    "            application/json:",
    "              schema:",
    `                $ref: '#/components/schemas/${singular}'`,
    "        '404':",
    "          description: unknown id",
    "    delete:",
    `      operationId: delete${singular}`,
    "      responses:",
    "        '204':",
    "          description: deleted"
  );
}

lines.push("components:", "  schemas:");
for (const name of resources) {
  const singular = name.replace(/s$/, "");
  lines.push(
    `    ${singular}:`,
    "      type: object",
    "      required: [id, name, email, status, createdAt]",
    "      properties:",
    "        id:",
    "          type: string",
    `          pattern: '^${singular}_[A-Za-z0-9]{6,10}$'`,
    "        name:",
    "          type: string",
    "          minLength: 2",
    "          maxLength: 40",
    "        email:",
    "          type: string",
    "          format: email",
    "        status:",
    "          type: string",
    "          enum: [active, blocked]",
    "        createdAt:",
    "          type: string",
    "          format: date-time",
    `    ${singular}Create:`,
    "      type: object",
    "      required: [name, email]",
    "      properties:",
    "        id:",
    "          type: string",
    "          pattern: '^[A-Za-z0-9_-]{1,64}$'",
    "        name:",
    "          type: string",
    "          minLength: 2",
    "          maxLength: 40",
    "        email:",
    "          type: string",
    "          format: email",
    "        status:",
    "          type: string",
    "          enum: [active, blocked]"
  );
}

writeFileSync(out, lines.join("\n") + "\n");
const ops = resources.length * 4;
console.log(`wrote ${out}: ${resources.length} resources, ${ops} operations`);
