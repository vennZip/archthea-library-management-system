import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { authenticate } from "../src/middleware/auth.js";
import { AppError } from "../src/models/AppError.js";
import { databaseError } from "../src/utils/databaseError.js";
import { createDatabase, seedDatabase, ids, call } from "./database.js";
import { toCsv } from "../src/utils/csv.js";

let db;
let app;
let repository;
let auth;
const studentToken = "verified-student-token";
const adminToken = "verified-admin-token";
const as = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  db = await createDatabase();
});
beforeEach(async () => {
  await seedDatabase(db);
  repository = {
    profile: async (id) =>
      (await db.query("select * from public.profiles where id=$1", [id]))
        .rows[0],
    rpc: async (name, args) => {
      try {
        return await call(db, name, Object.values(args));
      } catch (error) {
        throw databaseError(error);
      }
    },
    catalog: vi.fn(async (query) => ({
      items: [],
      total: 0,
      page: query.page,
      page_size: query.page_size,
    })),
    book: async () => {
      throw new AppError("Book not found.", {
        status: 404,
        code: "BOOK_NOT_FOUND",
      });
    },
  };
  auth = {
    auth: {
      getUser: vi.fn(async (token) => ({
        data: {
          user:
            token === studentToken
              ? { id: ids.student }
              : token === adminToken
                ? { id: ids.admin }
                : null,
        },
        error: null,
      })),
    },
  };
  app = createApp({
    repository,
    configured: true,
    storage: { decorate: async (books) => books },
    authentication: authenticate({
      auth,
      repository,
      scopedClient: () => ({}),
    }),
    rateLimitEnabled: false,
  });
});
afterAll(async () => {
  await db?.close();
});

describe("HTTP authentication and authorization", () => {
  it("allows the public health endpoint", async () => {
    expect((await request(app).get("/api/v1/health")).body.data.status).toBe(
      "ok",
    );
  });
  it("rejects missing and invalid bearer tokens", async () => {
    expect((await request(app).get("/api/v1/me")).status).toBe(401);
    expect(
      (await request(app).get("/api/v1/me").set(as("invalid"))).status,
    ).toBe(401);
  });
  it("verifies the supplied token and exposes only the current account", async () => {
    const response = await request(app).get("/api/v1/me").set(as(studentToken));
    expect(auth.auth.getUser).toHaveBeenCalledWith(studentToken);
    expect(response.body.data.id).toBe(ids.student);
    expect(response.body.data.client).toBeUndefined();
  });
  it("blocks accounts deactivated after token issuance", async () => {
    await db.query("update public.profiles set status='INACTIVE' where id=$1", [
      ids.student,
    ]);
    expect(
      (await request(app).get("/api/v1/me").set(as(studentToken))).status,
    ).toBe(403);
  });
  it.each([
    "/students",
    "/loans",
    "/reports",
    "/reports/export",
    "/audit-logs",
    "/dashboard/admin",
    `/books/${ids.book}/copies`,
  ])("blocks student administrative GET %s", async (path) => {
    expect(
      (await request(app).get(`/api/v1${path}`).set(as(studentToken))).status,
    ).toBe(403);
  });
  it("blocks student writes even when the route is known", async () => {
    expect(
      (
        await request(app)
          .post("/api/v1/books")
          .set(as(studentToken))
          .send({ title: "Unauthorized" })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch("/api/v1/settings")
          .set(as(studentToken))
          .send({ max_books: 50 })
      ).status,
    ).toBe(403);
  });
  it("rejects profile privilege escalation fields", async () => {
    const response = await request(app)
      .patch("/api/v1/me")
      .set(as(studentToken))
      .send({ full_name: "Student", role: "LIBRARIAN" });
    expect(response.status).toBe(422);
  });
  it("denies unapproved browser origins", async () => {
    expect(
      (
        await request(app)
          .get("/api/v1/health")
          .set("Origin", "https://untrusted.invalid")
      ).status,
    ).toBe(403);
  });
});

describe("API circulation and validation", () => {
  it("executes checkout through the controller, service and real SQL function", async () => {
    const key = randomUUID();
    const response = await request(app)
      .post("/api/v1/loans")
      .set(as(studentToken))
      .set("Idempotency-Key", key)
      .send({ book_id: ids.book });
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("ACTIVE");
    const duplicate = await request(app)
      .post("/api/v1/loans")
      .set(as(studentToken))
      .set("Idempotency-Key", key)
      .send({ book_id: ids.book });
    expect(duplicate.body.data.id).toBe(response.body.data.id);
  });
  it("requires idempotency and rejects invalid resource identifiers", async () => {
    expect(
      (
        await request(app)
          .post("/api/v1/loans")
          .set(as(studentToken))
          .send({ book_id: ids.book })
      ).status,
    ).toBe(422);
    expect(
      (await request(app).get("/api/v1/books/not-a-uuid").set(as(studentToken)))
        .status,
    ).toBe(422);
  });
  it("returns a safe conflict for unavailable stock", async () => {
    await call(db, "borrow_book", [
      ids.second,
      ids.second,
      ids.book,
      randomUUID(),
    ]);
    const response = await request(app)
      .post("/api/v1/loans")
      .set(as(studentToken))
      .set("Idempotency-Key", randomUUID())
      .send({ book_id: ids.book });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("COPY_UNAVAILABLE");
    expect(response.body.error.request_id).toBeTruthy();
  });
  it("validates pagination and publication ranges", async () => {
    expect(
      (
        await request(app)
          .get("/api/v1/books?page_size=999")
          .set(as(studentToken))
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .get("/api/v1/books?year_from=2020&year_to=2000")
          .set(as(studentToken))
      ).status,
    ).toBe(422);
  });
  it("rejects malformed JSON with a safe error", async () => {
    const response = await request(app)
      .post("/api/v1/loans")
      .set(as(studentToken))
      .set("Content-Type", "application/json")
      .send("{invalid");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });
  it("does not expose database internals on unexpected failures", async () => {
    repository.catalog.mockRejectedValueOnce(
      new Error("internal SQL and a private credential"),
    );
    const response = await request(app)
      .get("/api/v1/books")
      .set(as(studentToken));
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("credential");
  });
  it("escapes CSV values and spreadsheet formulas", () => {
    const result = toCsv([{ name: '=HYPERLINK("bad")', count: 2 }]);
    expect(result).toContain("'=HYPERLINK");
    expect(result).toContain('""bad""');
  });
});
