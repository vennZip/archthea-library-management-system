import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { call, createDatabase, ids, seedDatabase } from "./database.js";

let db;
beforeAll(async () => {
  db = await createDatabase();
});
beforeEach(async () => {
  await seedDatabase(db);
  await db.exec("update private.job_state set last_book_id=null");
});
afterAll(async () => {
  await db?.close();
});
const search = (query) => call(db, "search_catalog", [ids.student, query]);

describe("parameterized catalog search", () => {
  it("preserves punctuation and treats filter syntax as literal text", async () => {
    await db.query("update public.books set title=$1 where id=$2", [
      "Ideas, (Art) & 100% Curiosity",
      ids.book,
    ]);
    await db.query("update public.authors set name=$1 where id=$2", [
      "J. R. R. Tolkien",
      ids.author,
    ]);
    expect((await search({ q: "Ideas, (Art)" })).items[0].id).toBe(ids.book);
    expect((await search({ q: "J. R. R." })).total).toBe(2);
    expect((await search({ q: "100%" })).total).toBe(1);
    expect((await search({ q: "title.eq.Book 2),id.neq.null" })).total).toBe(0);
    expect((await search({ q: "%" })).total).toBe(1);
  });
  it("combines ISBN, category, availability and publication filters", async () => {
    await db.query(
      "update public.books set isbn=$1,publication_year=2020 where id=$2",
      ["9780140449136", ids.book],
    );
    expect(
      (
        await search({
          q: "978-0-14044913-6",
          year_from: 2019,
          year_to: 2021,
          category_id: ids.category,
          availability: "available",
        })
      ).total,
    ).toBe(1);
    expect((await search({ year_to: 2010 })).total).toBe(0);
    expect((await search({ availability: "unavailable" })).total).toBe(0);
  });
  it("paginates in deterministic order and excludes archived books for students", async () => {
    const first = await search({ page: 1, page_size: 1 });
    const second = await search({ page: 2, page_size: 1 });
    expect(first.total).toBe(2);
    expect(first.items[0].title).toBe("Book 1");
    expect(second.items[0].title).toBe("Book 2");
    await call(db, "archive_book", [ids.admin, ids.book, true]);
    expect((await search({})).total).toBe(1);
    await expect(search({ archived: true })).rejects.toThrow("FORBIDDEN");
    expect(
      (await call(db, "search_catalog", [ids.admin, { archived: true }]))
        .items[0].id,
    ).toBe(ids.book);
  });
  it("denies direct browser execution while allowing the backend role", async () => {
    await db.exec("set role authenticated");
    try {
      await expect(search({})).rejects.toThrow("permission denied");
    } finally {
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    try {
      expect((await search({})).total).toBe(2);
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("fair scheduled batches", () => {
  it("moves beyond 500 waiting lists that cannot make progress", async () => {
    // Deterministically ordered IDs make the last list fall beyond the first batch.
    await db.query(
      `insert into public.books(id,title,category_id)
      select ('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Waiting book '||n,$1
      from generate_series(1,501) n`,
      [ids.category],
    );
    await db.query(
      `insert into public.reservations(book_id,student_id)
      select id,$1 from public.books where title like 'Waiting book %'`,
      [ids.second],
    );
    await db.query(
      `insert into public.book_copies(book_id,barcode) values($1,'BATCH-LAST')`,
      ["90000000-0000-4000-8000-000000000501"],
    );
    expect((await call(db, "run_library_jobs")).books_checked).toBe(500);
    expect(
      (
        await db.query(
          "select count(*)::integer as count from public.reservations where status='READY_FOR_PICKUP'",
        )
      ).rows[0].count,
    ).toBe(0);
    expect((await call(db, "run_library_jobs")).books_checked).toBe(1);
    expect(
      (
        await db.query(
          "select book_id from public.reservations where status='READY_FOR_PICKUP'",
        )
      ).rows[0].book_id,
    ).toBe("90000000-0000-4000-8000-000000000501");
    expect((await call(db, "run_library_jobs")).books_checked).toBe(500);
  });
  it("keeps the scheduling cursor unavailable to browser roles", async () => {
    await db.exec("set role authenticated");
    try {
      await expect(db.exec("select * from private.job_state")).rejects.toThrow(
        "permission denied",
      );
    } finally {
      await db.exec("reset role");
    }
  });
});
