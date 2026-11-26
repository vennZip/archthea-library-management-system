// Run only against an explicitly configured, dedicated Supabase TEST project.
// No credentials or data from the normal application environment are used.
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

dotenv.config({
  path: fileURLToPath(new URL("../.env.concurrency", import.meta.url)),
  quiet: true,
});
const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || process.env.CONFIRM_DEDICATED_TEST_PROJECT !== "yes") {
  console.error(
    "Configure backend/.env.concurrency from its example using a dedicated test project, then set CONFIRM_DEDICATED_TEST_PROJECT=yes. No live concurrency test was run.",
  );
  process.exitCode = 1;
} else {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = randomUUID();
  const users = [];
  const categoryId = randomUUID();
  const authorId = randomUUID();
  const bookIds = [randomUUID(), randomUUID()];
  let originalPolicy;
  const checked = async (operation) => {
    const result = await operation;
    if (result.error)
      throw new Error(
        `Test database operation failed (${result.error.code || "unknown"}).`,
      );
    return result.data;
  };
  try {
    originalPolicy = await checked(
      client.from("library_settings").select("*").eq("id", true).single(),
    );
    for (let i = 0; i < 3; i++) {
      const { user } = await checked(
        client.auth.admin.createUser({
          email: `concurrency-${suffix}-${i}@example.invalid`,
          email_confirm: true,
        }),
      );
      users.push(user.id);
      await checked(
        client.from("profiles").insert({
          id: user.id,
          full_name: `Concurrency test ${i}`,
          role: i ? "STUDENT" : "LIBRARIAN",
        }),
      );
      await checked(
        client
          .from(i ? "student_profiles" : "librarian_profiles")
          .insert(
            i
              ? { id: user.id, student_number: `TEST-${suffix}-${i}` }
              : { id: user.id, staff_number: `TEST-${suffix}` },
          ),
      );
    }
    await checked(
      client
        .from("categories")
        .insert({ id: categoryId, name: `Concurrency test ${suffix}` }),
    );
    await checked(
      client
        .from("authors")
        .insert({ id: authorId, name: `Test author ${suffix}` }),
    );
    for (const id of bookIds) {
      await checked(
        client.from("books").insert({
          id,
          title: `Concurrency test ${id}`,
          category_id: categoryId,
        }),
      );
      await checked(
        client
          .from("book_authors")
          .insert({ book_id: id, author_id: authorId }),
      );
      await checked(
        client
          .from("book_copies")
          .insert({ book_id: id, barcode: `TEST-${id}` }),
      );
    }
    const borrow = (student, book) =>
      client.rpc("borrow_book", {
        p_actor: student,
        p_student: student,
        p_book: book,
        p_key: randomUUID(),
      });
    const results = await Promise.all([
      borrow(users[1], bookIds[0]),
      borrow(users[2], bookIds[0]),
    ]);
    assert.equal(
      results.filter((result) => !result.error).length,
      1,
      "Exactly one competing borrower must succeed.",
    );
    assert.equal(
      results.find((result) => result.error).error.message,
      "COPY_UNAVAILABLE",
    );
    const winner = results.find((result) => !result.error).data;
    await checked(
      client.rpc("return_book", {
        p_actor: users[0],
        p_loan: winner.id,
        p_condition: "GOOD",
        p_key: randomUUID(),
      }),
    );
    await checked(
      client.from("library_settings").update({ max_books: 1 }).eq("id", true),
    );
    const limitResults = await Promise.all(
      bookIds.map((book) => borrow(users[1], book)),
    );
    assert.equal(
      limitResults.filter((result) => !result.error).length,
      1,
      "Concurrent checkouts must not exceed the borrowing limit.",
    );
    assert.equal(
      limitResults.find((result) => result.error).error.message,
      "BORROW_LIMIT_REACHED",
    );
    const activeLoan = limitResults.find((result) => !result.error).data;
    const heldCopy = await checked(
      client
        .from("book_copies")
        .select("book_id")
        .eq("id", activeLoan.copy_id)
        .single(),
    );
    const reservations = await Promise.all(
      [1, 2].map(() =>
        client.rpc("reserve_book", {
          p_actor: users[2],
          p_book: heldCopy.book_id,
          p_key: randomUUID(),
        }),
      ),
    );
    assert.equal(
      reservations.filter((result) => !result.error).length,
      1,
      "Concurrent duplicate reservations must be rejected.",
    );
    assert.equal(
      reservations.find((result) => result.error).error.message,
      "RESERVATION_EXISTS",
    );
    console.log(
      "Passed: competing borrowers, concurrent borrowing limits, concurrent duplicate reservations.",
    );
  } finally {
    // Every deletion is scoped to UUIDs created by this test. Existing records are retained.
    if (originalPolicy)
      await checked(
        client.from("library_settings").update(originalPolicy).eq("id", true),
      );
    if (users.length) {
      const reservations = await checked(
        client.from("reservations").select("id").in("student_id", users),
      );
      const reservationIds = reservations.map((row) => row.id);
      await checked(
        client.from("borrow_transactions").delete().in("student_id", users),
      );
      await checked(
        client.from("reservations").delete().in("student_id", users),
      );
      await checked(client.from("notifications").delete().in("user_id", users));
      await checked(
        client.from("idempotency_requests").delete().in("actor_id", users),
      );
      await checked(client.from("audit_logs").delete().in("actor_id", users));
      if (reservationIds.length)
        await checked(
          client.from("audit_logs").delete().in("entity_id", reservationIds),
        );
      await checked(client.from("book_copies").delete().in("book_id", bookIds));
      await checked(
        client.from("book_authors").delete().in("book_id", bookIds),
      );
      await checked(client.from("books").delete().in("id", bookIds));
      await checked(client.from("authors").delete().eq("id", authorId));
      await checked(client.from("categories").delete().eq("id", categoryId));
      await checked(client.from("student_profiles").delete().in("id", users));
      await checked(client.from("librarian_profiles").delete().in("id", users));
      await checked(client.from("profiles").delete().in("id", users));
      for (const user of users)
        await checked(client.auth.admin.deleteUser(user));
    }
  }
}
