import { writeFile } from "node:fs/promises";
import { format } from "prettier";
import { z } from "zod";
import * as schema from "../backend/src/validators/schemas.js";

const routes = [
  ["get", "/health", "Public"],
  ["get", "/me", "Both"],
  ["patch", "/me", "Both", "ownProfileBody"],
  ["get", "/dashboard/student", "Student"],
  ["get", "/dashboard/admin", "Librarian"],
  ["get", "/books", "Both", null, "catalogQuery"],
  ["post", "/books", "Librarian", "bookBody"],
  ["get", "/books/{id}", "Both"],
  ["patch", "/books/{id}", "Librarian", "bookBody"],
  ["delete", "/books/{id}", "Librarian"],
  ["post", "/books/{id}/restore", "Librarian"],
  ["post", "/books/{id}/cover", "Librarian", "upload"],
  ["delete", "/books/{id}/cover", "Librarian"],
  ["get", "/books/{id}/copies", "Librarian", null, "pageQuery"],
  ["post", "/books/{id}/copies", "Librarian", "copyBody"],
  ["patch", "/copies/{id}", "Librarian", "copyBody"],
  ["delete", "/copies/{id}", "Librarian"],
  ["get", "/books/{id}/queue", "Librarian", null, "reservationQuery"],
  ["get", "/me/loans", "Student", null, "loanQuery"],
  ["get", "/loans", "Librarian", null, "loanQuery"],
  ["get", "/loans/{id}", "Librarian"],
  ["post", "/loans", "Both", "borrowBody", null, true],
  ["post", "/loans/{id}/return", "Librarian", "returnBody", null, true],
  ["get", "/me/reservations", "Student", null, "reservationQuery"],
  ["get", "/reservations", "Librarian", null, "reservationQuery"],
  ["post", "/reservations", "Student", "reservationBody", null, true],
  ["post", "/reservations/{id}/cancel", "Owner or librarian"],
  ["get", "/students", "Librarian", null, "studentQuery"],
  ["post", "/students", "Librarian", "studentBody"],
  ["get", "/students/{id}", "Librarian"],
  ["patch", "/students/{id}", "Librarian", "studentPatch"],
  ["get", "/students/{id}/eligibility", "Librarian"],
  ["get", "/notifications", "Recipient", null, "notificationQuery"],
  ["patch", "/notifications/{id}/read", "Recipient"],
  ["post", "/notifications/read-all", "Recipient"],
  ["get", "/settings", "Both"],
  ["patch", "/settings", "Librarian", "settingsBody"],
  ["get", "/audit-logs", "Librarian", null, "pageQuery"],
  ["get", "/reports", "Librarian"],
  ...[
    "summary",
    "trends",
    "popular-books",
    "active-borrowers",
    "categories",
    "returns",
    "export",
  ].map((name) => ["get", `/reports/${name}`, "Librarian"]),
  ...["categories", "authors", "publishers"].flatMap((name) => [
    ["get", `/${name}`, "Both"],
    ["post", `/${name}`, "Librarian", "referenceBody"],
    ["patch", `/${name}/{id}`, "Librarian", "referenceBody"],
    ["delete", `/${name}/{id}`, "Librarian"],
  ]),
];
const convert = (value) => {
  const json = z.toJSONSchema(value, { io: "input", unrepresentable: "any" });
  delete json.$schema;
  return json;
};
const bodyNames = [
  ...new Set(
    routes.map((row) => row[3]).filter((name) => name && name !== "upload"),
  ),
];
const document = {
  openapi: "3.1.0",
  info: {
    title: "Archthea Library API",
    version: "1.0.0",
    description:
      "Supabase Auth bearer tokens are verified by Express. Administrative operations require an active LIBRARIAN profile. All application writes pass through Express. Errors use { error: { code, message, request_id, issues? } }; successful JSON responses use { data: ... }. Collections return data.items, total, page and page_size. DELETE books archives; DELETE copies retires. Critical circulation writes require UUID Idempotency-Key values, retained for 30 days. Retries must reuse the same key and payload.",
  },
  servers: [
    { url: "http://127.0.0.1:4000/api/v1", description: "Local development" },
  ],
  security: [{ bearerAuth: [] }],
  paths: {},
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Supabase JWT",
      },
    },
    schemas: {
      ...Object.fromEntries(
        bodyNames.map((name) => [name, convert(schema[name])]),
      ),
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              request_id: { type: "string", format: "uuid" },
              issues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
for (const [method, path, role, body, query, idempotent] of routes) {
  const parameters = [];
  if (path.includes("{id}"))
    parameters.push({
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    });
  if (query)
    for (const [name, definition] of Object.entries(
      convert(schema[query]).properties || {},
    ))
      parameters.push({ name, in: "query", schema: definition });
  if (idempotent)
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", format: "uuid" },
    });
  if (path === "/reports/export")
    parameters.push({
      name: "format",
      in: "query",
      schema: { type: "string", enum: ["csv"], default: "csv" },
    });
  const operation = {
    operationId: `${method}_${path.replace(/[{}]/g, "").replaceAll("/", "_")}`,
    tags: [path.split("/")[1]],
    summary: `${method.toUpperCase()} ${path}`,
    description: `Access: ${role}.`,
    parameters,
    responses: {
      [(method === "post" &&
        [
          "/books",
          "/loans",
          "/reservations",
          "/students",
          "/categories",
          "/authors",
          "/publishers",
        ].includes(path)) ||
      (method === "post" && path.endsWith("/copies"))
        ? 201
        : 200]: {
        description: "Success",
        content: {
          [path === "/reports/export" ? "text/csv" : "application/json"]: {
            schema:
              path === "/reports/export"
                ? { type: "string" }
                : { type: "object", properties: { data: {} } },
          },
        },
      },
      ...Object.fromEntries(
        [400, 401, 403, 404, 409, 413, 422, 429, 500, 503].map((status) => [
          status,
          {
            description: {
              400: "Invalid JSON",
              401: "Sign-in required",
              403: "Forbidden or inactive",
              404: "Not found",
              409: "Business-rule or uniqueness conflict",
              413: "Request too large",
              422: "Validation failed",
              429: "Rate limited",
              500: "Internal error",
              503: "Service not configured",
            }[status],
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        ]),
      ),
    },
  };
  if (role === "Public") operation.security = [];
  if (body)
    operation.requestBody = {
      required: true,
      content:
        body === "upload"
          ? {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["cover"],
                  properties: {
                    cover: {
                      type: "string",
                      format: "binary",
                      description:
                        "JPEG, PNG or WebP; max 5 MB. Server verifies signatures and re-encodes to WebP.",
                    },
                  },
                },
              },
            }
          : {
              "application/json": {
                schema: { $ref: `#/components/schemas/${body}` },
              },
            },
    };
  document.paths[path] ??= {};
  document.paths[path][method] = operation;
}
await writeFile(
  new URL("../docs/openapi.json", import.meta.url),
  await format(JSON.stringify(document), { parser: "json", endOfLine: "lf" }),
);
console.log(`Documented ${routes.length} API operations in docs/openapi.json.`);
