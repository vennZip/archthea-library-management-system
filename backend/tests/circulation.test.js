import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createDatabase, seedDatabase, call, ids } from "./database.js";

let db;
const borrow = (student = ids.student, book = ids.book, key = randomUUID()) =>
  call(db, "borrow_book", [student, student, book, key]);
const reserve = (student = ids.second, book = ids.book) =>
  call(db, "reserve_book", [student, book, randomUUID()]);
const giveBack = (loan, condition = "GOOD") =>
  call(db, "return_book", [ids.admin, loan.id, condition, randomUUID()]);
const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];

beforeAll(async () => {
  db = await createDatabase();
});
beforeEach(async () => {
  await seedDatabase(db);
});
afterAll(async () => {
  await db?.close();
});

describe("transactional circulation", () => {
  it("borrows a physical copy with a policy-derived due date and audit entry", async () => {
    const loan = await borrow();
    expect(loan.status).toBe("ACTIVE");
    expect(new Date(loan.due_at) - new Date(loan.borrowed_at)).toBeCloseTo(
      14 * 86400000,
      -2,
    );
    expect(
      await scalar(
        `select status from public.book_copies where id='${ids.copy}'`,
      ),
    ).toBe("BORROWED");
    expect(
      await scalar(
        "select count(*)::integer from public.audit_logs where action='BOOK_BORROWED'",
      ),
    ).toBe(1);
  });
  it("rejects allocation of an unavailable copy", async () => {
    await borrow();
    await expect(borrow(ids.second)).rejects.toThrow("COPY_UNAVAILABLE");
    expect(
      await scalar("select count(*)::integer from public.borrow_transactions"),
    ).toBe(1);
  });
  it("rejects borrowing for another student", async () => {
    await expect(
      call(db, "borrow_book", [
        ids.student,
        ids.second,
        ids.book,
        randomUUID(),
      ]),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("allows a librarian to process checkout and records the librarian", async () => {
    const loan = await call(db, "borrow_book", [
      ids.admin,
      ids.student,
      ids.book,
      randomUUID(),
    ]);
    expect(loan.processed_by).toBe(ids.admin);
  });
  it("blocks inactive and restricted accounts", async () => {
    await db.query("update public.profiles set status='INACTIVE' where id=$1", [
      ids.student,
    ]);
    await expect(borrow()).rejects.toThrow("ACCOUNT_INACTIVE");
    await db.query("update public.profiles set status='ACTIVE' where id=$1", [
      ids.student,
    ]);
    await db.query(
      "update public.student_profiles set borrowing_restricted=true where id=$1",
      [ids.student],
    );
    await expect(borrow()).rejects.toThrow("BORROWING_RESTRICTED");
  });
  it("enforces the borrowing limit across books", async () => {
    await db.exec("update public.library_settings set max_books=1");
    await borrow();
    await expect(borrow(ids.student, ids.otherBook)).rejects.toThrow(
      "BORROW_LIMIT_REACHED",
    );
  });
  it("enforces overdue restrictions and supports a configurable override", async () => {
    const loan = await borrow();
    await db.query(
      "update public.borrow_transactions set borrowed_at=now()-interval '20 days',due_at=now()-interval '1 day' where id=$1",
      [loan.id],
    );
    await expect(borrow(ids.student, ids.otherBook)).rejects.toThrow(
      "OVERDUE_RESTRICTION",
    );
    await db.exec("update public.library_settings set restrict_overdue=false");
    expect((await borrow(ids.student, ids.otherBook)).status).toBe("ACTIVE");
  });
  it("replays an idempotent checkout and rejects reuse for another request", async () => {
    const key = randomUUID();
    const first = await borrow(ids.student, ids.book, key);
    expect(await borrow(ids.student, ids.book, key)).toEqual(first);
    await expect(borrow(ids.student, ids.otherBook, key)).rejects.toThrow(
      "IDEMPOTENCY_CONFLICT",
    );
    expect(
      await scalar("select count(*)::integer from public.borrow_transactions"),
    ).toBe(1);
  });
  it("returns a loan atomically and prevents a second close", async () => {
    const loan = await borrow();
    const result = await giveBack(loan);
    expect(result.status).toBe("RETURNED");
    expect(result.returned_by).toBe(ids.admin);
    expect(
      await scalar(
        `select status from public.book_copies where id='${ids.copy}'`,
      ),
    ).toBe("AVAILABLE");
    await expect(giveBack(loan)).rejects.toThrow("LOAN_ALREADY_CLOSED");
  });
  it("rejects student returns", async () => {
    const loan = await borrow();
    await expect(
      call(db, "return_book", [ids.student, loan.id, "GOOD", randomUUID()]),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("keeps damaged returns unavailable", async () => {
    const loan = await borrow();
    await reserve();
    await giveBack(loan, "DAMAGED");
    expect(
      await scalar(
        `select status from public.book_copies where id='${ids.copy}'`,
      ),
    ).toBe("DAMAGED");
    expect(await scalar("select status from public.reservations")).toBe(
      "WAITING",
    );
  });
  it("rolls back allocation if a downstream database operation fails", async () => {
    await db.exec(`create function public.test_failure() returns trigger language plpgsql as $$ begin raise exception 'TEST_FAILURE'; end $$;
      create trigger test_failure before insert on public.notifications for each row execute function public.test_failure();`);
    try {
      await expect(borrow()).rejects.toThrow("TEST_FAILURE");
      expect(
        await scalar(
          "select count(*)::integer from public.borrow_transactions",
        ),
      ).toBe(0);
      expect(
        await scalar(
          `select status from public.book_copies where id='${ids.copy}'`,
        ),
      ).toBe("AVAILABLE");
    } finally {
      await db.exec(
        "drop trigger test_failure on public.notifications; drop function public.test_failure()",
      );
    }
  });
});

describe("reservation queue", () => {
  it("permits reservations only when copies are unavailable", async () => {
    await expect(reserve()).rejects.toThrow("BOOK_AVAILABLE");
    await borrow();
    expect((await reserve()).status).toBe("WAITING");
  });
  it("rejects duplicate active reservations", async () => {
    await borrow();
    await reserve();
    await expect(reserve()).rejects.toThrow("RESERVATION_EXISTS");
  });
  it("enforces the configured reservation limit", async () => {
    await db.exec("update public.library_settings set max_reservations=1");
    await borrow();
    await borrow(ids.student, ids.otherBook);
    await reserve();
    await expect(reserve(ids.second, ids.otherBook)).rejects.toThrow(
      "RESERVATION_LIMIT_REACHED",
    );
  });
  it("allocates returned copies in FIFO order and protects the hold", async () => {
    const loan = await borrow();
    const first = await reserve(ids.second);
    await reserve(ids.third);
    await giveBack(loan);
    expect(
      await scalar(
        `select status from public.reservations where id='${first.id}'`,
      ),
    ).toBe("READY_FOR_PICKUP");
    await expect(borrow(ids.third)).rejects.toThrow("COPY_UNAVAILABLE");
    const nextLoan = await borrow(ids.second);
    expect(nextLoan.reservation_id).toBe(first.id);
    expect(
      await scalar(
        `select status from public.reservations where id='${first.id}'`,
      ),
    ).toBe("COMPLETED");
  });
  it("reassigns a cancelled pickup hold to the next student", async () => {
    const loan = await borrow();
    const first = await reserve();
    const second = await reserve(ids.third);
    await giveBack(loan);
    await call(db, "cancel_reservation", [ids.second, first.id]);
    expect(
      await scalar(
        `select status from public.reservations where id='${second.id}'`,
      ),
    ).toBe("READY_FOR_PICKUP");
  });
  it("does not allow another student to cancel a reservation", async () => {
    await borrow();
    const hold = await reserve();
    await expect(
      call(db, "cancel_reservation", [ids.third, hold.id]),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("expires unclaimed holds, promotes the next student and deduplicates reminders", async () => {
    const loan = await borrow();
    const first = await reserve();
    const second = await reserve(ids.third);
    await giveBack(loan);
    await db.query(
      "update public.reservations set ready_at=now()-interval '3 days',expires_at=now()-interval '1 day' where id=$1",
      [first.id],
    );
    await call(db, "run_library_jobs");
    await call(db, "run_library_jobs");
    expect(
      await scalar(
        `select status from public.reservations where id='${first.id}'`,
      ),
    ).toBe("EXPIRED");
    expect(
      await scalar(
        `select status from public.reservations where id='${second.id}'`,
      ),
    ).toBe("READY_FOR_PICKUP");
    expect(
      await scalar(
        "select count(*)::integer from public.notifications where type='RESERVATION_EXPIRED'",
      ),
    ).toBe(1);
  });
});

describe("administration and RLS", () => {
  it("archives safely and preserves existing loan due dates after a policy change", async () => {
    const loan = await borrow();
    await expect(
      call(db, "archive_book", [ids.admin, ids.book, true]),
    ).rejects.toThrow("BOOK_HAS_ACTIVITY");
    await call(db, "update_settings", [
      ids.admin,
      {
        max_books: 5,
        loan_days: 21,
        max_reservations: 4,
        collection_hours: 24,
        restrict_overdue: true,
        timezone: "Asia/Singapore",
      },
    ]);
    const saved = (
      await db.query(
        "select due_at from public.borrow_transactions where id=$1",
        [loan.id],
      )
    ).rows[0];
    expect(new Date(saved.due_at).toISOString()).toBe(
      new Date(loan.due_at).toISOString(),
    );
  });
  it("prevents inventory edits on a borrowed copy", async () => {
    await borrow();
    await expect(
      call(db, "manage_copy", [
        ids.admin,
        ids.book,
        ids.copy,
        { status: "AVAILABLE" },
        false,
      ]),
    ).rejects.toThrow("COPY_IN_USE");
  });
  it("deactivation releases reservations without deleting outstanding loans", async () => {
    const loan = await borrow();
    const first = await reserve();
    await reserve(ids.third);
    await giveBack(loan);
    await call(db, "save_student", [
      ids.admin,
      ids.second,
      { status: "INACTIVE" },
      false,
    ]);
    expect(
      await scalar(
        `select status from public.reservations where id='${first.id}'`,
      ),
    ).toBe("CANCELLED");
    expect(
      await scalar("select count(*)::integer from public.borrow_transactions"),
    ).toBe(1);
  });
  it("enforces own-row reads and denies direct mutations and RPC execution", async () => {
    await borrow();
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      ids.second,
    ]);
    await db.exec("set role authenticated");
    try {
      expect(
        await scalar("select count(*)::integer from public.profiles"),
      ).toBe(1);
      expect(
        await scalar(
          "select count(*)::integer from public.borrow_transactions",
        ),
      ).toBe(0);
      await expect(
        db.exec("update public.profiles set role='LIBRARIAN'"),
      ).rejects.toThrow("permission denied");
      await expect(
        call(db, "borrow_book", [
          ids.second,
          ids.second,
          ids.otherBook,
          randomUUID(),
        ]),
      ).rejects.toThrow("permission denied");
    } finally {
      await db.exec("reset role");
    }
  });
  it("blocks student access to reports and includes accurate admin totals", async () => {
    await expect(call(db, "library_report", [ids.student])).rejects.toThrow(
      "FORBIDDEN",
    );
    await borrow();
    const report = await call(db, "library_report", [ids.admin]);
    expect(report.summary).toMatchObject({
      books: 2,
      copies: 2,
      available: 1,
      borrowed: 1,
      students: 3,
    });
    expect(report.monthly).toHaveLength(12);
  });
});
