import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { call, createDatabase, ids, seedDatabase } from "./database.js";

let db;
beforeAll(async () => {
  db = await createDatabase();
});
beforeEach(async () => {
  await seedDatabase(db);
});
afterAll(async () => {
  await db?.close();
});
const borrow = () =>
  call(db, "borrow_book", [ids.student, ids.student, ids.book, randomUUID()]);
const bookData = {
  title: "A new library book",
  category_id: ids.category,
  author_ids: [ids.author],
  initial_copies: 2,
};

describe("catalog management and reporting", () => {
  it("creates normalized author links and physical copies with derived catalog totals", async () => {
    const book = await call(db, "save_book", [ids.admin, null, bookData]);
    const {
      rows: [catalog],
    } = await db.query("select * from public.catalog where id=$1", [book.id]);
    expect(catalog.total_copies).toBe(2);
    expect(catalog.available_copies).toBe(2);
    expect(catalog.authors[0].id).toBe(ids.author);
    expect(
      new Set(
        (
          await db.query(
            "select barcode from public.book_copies where book_id=$1",
            [book.id],
          )
        ).rows.map((row) => row.barcode),
      ).size,
    ).toBe(2);
  });
  it("rolls back a book edit when an author reference is invalid", async () => {
    await expect(
      call(db, "save_book", [
        ids.admin,
        ids.book,
        { ...bookData, author_ids: [randomUUID()], initial_copies: 0 },
      ]),
    ).rejects.toThrow("foreign key");
    expect(
      (await db.query("select title from public.books where id=$1", [ids.book]))
        .rows[0].title,
    ).toBe("Book 1");
  });
  it("supports reference CRUD and prevents deletion of referenced metadata", async () => {
    const reference = await call(db, "manage_reference", [
      ids.admin,
      "categories",
      null,
      "New category",
      false,
    ]);
    const changed = await call(db, "manage_reference", [
      ids.admin,
      "categories",
      reference.id,
      "Updated category",
      false,
    ]);
    expect(changed.name).toBe("Updated category");
    await call(db, "manage_reference", [
      ids.admin,
      "categories",
      reference.id,
      null,
      true,
    ]);
    await expect(
      call(db, "manage_reference", [
        ids.admin,
        "categories",
        ids.category,
        null,
        true,
      ]),
    ).rejects.toThrow("foreign key");
    await expect(
      call(db, "manage_reference", [
        ids.admin,
        "profiles",
        ids.student,
        "Invalid",
        false,
      ]),
    ).rejects.toThrow("INVALID_ENTITY");
  });
  it("archives and restores a book without losing its history", async () => {
    const loan = await borrow();
    await call(db, "return_book", [ids.admin, loan.id, "GOOD", randomUUID()]);
    expect(
      (await call(db, "archive_book", [ids.admin, ids.book, true])).archived_at,
    ).not.toBeNull();
    await expect(borrow()).rejects.toThrow("BOOK_NOT_FOUND");
    expect(
      (await call(db, "archive_book", [ids.admin, ids.book, false]))
        .archived_at,
    ).toBeNull();
    expect(
      (await call(db, "library_report", [ids.admin])).popular_books[0].count,
    ).toBe(1);
  });
  it("allows the actual service role to execute circulation functions", async () => {
    await db.exec("set role service_role");
    try {
      expect((await borrow()).status).toBe("ACTIVE");
    } finally {
      await db.exec("reset role");
    }
  });
});

describe("inventory and account operations", () => {
  it("never makes a newly added damaged copy available", async () => {
    const copy = await call(db, "manage_copy", [
      ids.admin,
      ids.book,
      null,
      { status: "DAMAGED" },
      false,
    ]);
    expect(copy.status).toBe("DAMAGED");
    expect(copy.condition).toBe("DAMAGED");
    await expect(
      call(db, "manage_copy", [
        ids.admin,
        ids.book,
        copy.id,
        { status: "AVAILABLE" },
        false,
      ]),
    ).rejects.toThrow("INVALID_COPY_STATUS");
  });
  it("allocates a newly added usable copy to the next waiting reader", async () => {
    await borrow();
    const reservation = await call(db, "reserve_book", [
      ids.second,
      ids.book,
      randomUUID(),
    ]);
    await call(db, "manage_copy", [ids.admin, ids.book, null, {}, false]);
    expect(
      (
        await db.query("select status from public.reservations where id=$1", [
          reservation.id,
        ])
      ).rows[0].status,
    ).toBe("READY_FOR_PICKUP");
  });
  it("records lost books without returning them to availability", async () => {
    const loan = await borrow();
    expect(
      (
        await call(db, "return_book", [
          ids.admin,
          loan.id,
          "LOST",
          randomUUID(),
        ])
      ).status,
    ).toBe("LOST");
    const report = await call(db, "library_report", [ids.admin]);
    expect(report.summary.lost).toBe(1);
    expect(report.summary.borrowed).toBe(0);
  });
  it("retires a copy while preserving earlier loan references", async () => {
    const loan = await borrow();
    await call(db, "return_book", [ids.admin, loan.id, "GOOD", randomUUID()]);
    await call(db, "manage_copy", [ids.admin, ids.book, ids.copy, {}, true]);
    expect(
      (
        await db.query(
          "select count(*)::integer as count from public.borrow_transactions",
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (
        await db.query("select total_copies from public.catalog where id=$1", [
          ids.book,
        ])
      ).rows[0].total_copies,
    ).toBe(0);
  });
  it("rejects pickup allocations from a different book", async () => {
    await expect(
      db.query(
        "insert into public.reservations(student_id,book_id,copy_id,status,ready_at,expires_at) values($1,$2,$3,'READY_FOR_PICKUP',now(),now()+interval '1 day')",
        [ids.second, ids.otherBook, ids.copy],
      ),
    ).rejects.toThrow("foreign key");
  });
  it("updates permitted account fields and guards library policies", async () => {
    expect(
      (await call(db, "update_own_profile", [ids.student, "New Full Name"]))
        .role,
    ).toBe("STUDENT");
    await expect(
      call(db, "update_settings", [ids.student, {}]),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      call(db, "update_settings", [ids.admin, { timezone: "Not/AZone" }]),
    ).rejects.toThrow("INVALID_TIMEZONE");
  });
});

describe("notification delivery", () => {
  it("marks only the recipient’s notifications as read", async () => {
    await borrow();
    const notification = (await db.query("select id from public.notifications"))
      .rows[0];
    await expect(
      call(db, "read_notifications", [ids.second, notification.id]),
    ).rejects.toThrow("RECORD_NOT_FOUND");
    expect(
      (await call(db, "read_notifications", [ids.student, notification.id]))
        .updated,
    ).toBe(1);
  });
  it("deduplicates due-soon and overdue reminders", async () => {
    const loan = await borrow();
    await db.query(
      "update public.borrow_transactions set due_at=now()+interval '1 day' where id=$1",
      [loan.id],
    );
    await call(db, "run_library_jobs");
    await call(db, "run_library_jobs");
    expect(
      (
        await db.query(
          "select count(*)::integer as count from public.notifications where type='DUE_SOON'",
        )
      ).rows[0].count,
    ).toBe(1);
    await db.query(
      "update public.borrow_transactions set borrowed_at=now()-interval '10 days',due_at=now()-interval '1 day' where id=$1",
      [loan.id],
    );
    await call(db, "run_library_jobs");
    await call(db, "run_library_jobs");
    expect(
      (
        await db.query(
          "select count(*)::integer as count from public.notifications where type='OVERDUE'",
        )
      ).rows[0].count,
    ).toBe(1);
  });
});
