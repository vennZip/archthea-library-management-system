import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

export const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  student: "00000000-0000-4000-8000-000000000002",
  second: "00000000-0000-4000-8000-000000000003",
  third: "00000000-0000-4000-8000-000000000004",
  category: "10000000-0000-4000-8000-000000000001",
  author: "20000000-0000-4000-8000-000000000001",
  book: "30000000-0000-4000-8000-000000000001",
  otherBook: "30000000-0000-4000-8000-000000000002",
  copy: "40000000-0000-4000-8000-000000000001",
};

export async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  `);
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(new URL(file, directory), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(
        `${file}: ${error.message}; near ${sql.slice(Math.max(0, Number(error.position) - 100), Number(error.position) + 100)}`,
        { cause: error },
      );
    }
  }
  return db;
}

export async function seedDatabase(db) {
  await db.exec(`reset role; truncate auth.users,public.categories,public.authors,public.publishers,public.library_settings restart identity cascade;
    insert into public.library_settings(id) values(true);`);
  for (const [index, id] of [
    ids.admin,
    ids.student,
    ids.second,
    ids.third,
  ].entries()) {
    await db.query("insert into auth.users values($1,$2)", [
      id,
      `user${index}@test.invalid`,
    ]);
    await db.query(
      "insert into public.profiles(id,full_name,role) values($1,$2,$3)",
      [id, `Test User ${index}`, index === 0 ? "LIBRARIAN" : "STUDENT"],
    );
    if (index === 0)
      await db.query("insert into public.librarian_profiles values($1,$2)", [
        id,
        "STAFF-1",
      ]);
    else
      await db.query(
        "insert into public.student_profiles(id,student_number) values($1,$2)",
        [id, `STU-${index}`],
      );
  }
  await db.query("insert into public.categories(id,name) values($1,$2)", [
    ids.category,
    "Literature",
  ]);
  await db.query("insert into public.authors(id,name) values($1,$2)", [
    ids.author,
    "Test Author",
  ]);
  for (const [index, book] of [ids.book, ids.otherBook].entries()) {
    await db.query(
      "insert into public.books(id,title,category_id) values($1,$2,$3)",
      [book, `Book ${index + 1}`, ids.category],
    );
    await db.query(
      "insert into public.book_authors(book_id,author_id) values($1,$2)",
      [book, ids.author],
    );
    await db.query(
      "insert into public.book_copies(id,book_id,barcode) values($1,$2,$3)",
      [
        index === 0 ? ids.copy : "40000000-0000-4000-8000-000000000002",
        book,
        `COPY-${index + 1}`,
      ],
    );
  }
}

export async function call(db, name, values = []) {
  const params = values.map((_, i) => `$${i + 1}`).join(",");
  return (await db.query(`select public.${name}(${params}) as result`, values))
    .rows[0].result;
}
