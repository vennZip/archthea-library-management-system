// Network and Auth fixtures are only imported by browser tests. The application
// has no demo-data fallback, auth bypass, or mock API mode.
const id = (value) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const timestamp = (days) =>
  new Date(Date.now() + days * 86400000).toISOString();
export const policy = {
  id: true,
  max_books: 3,
  loan_days: 14,
  max_reservations: 3,
  collection_hours: 48,
  restrict_overdue: true,
  timezone: "Asia/Singapore",
  updated_at: timestamp(-1),
};
export const category = { id: id(10), name: "Literature" };
export const author = { id: id(20), name: "Virginia Woolf" };
export const books = [
  "A Room of One’s Own",
  "The Waves",
  "To the Lighthouse",
  "Orlando",
].map((title, i) => ({
  id: id(100 + i),
  title,
  category_id: category.id,
  category: category.name,
  authors: [author],
  publisher_id: null,
  publisher: "The Modern Library",
  isbn: null,
  publication_year: 1929,
  description:
    "A thoughtful invitation to see the familiar world in a new light. A title from the library collection.",
  cover_path: null,
  cover_url: null,
  total_copies: 3,
  available_copies: i === 2 ? 0 : 2,
  borrowed_copies: i === 2 ? 3 : 1,
  reserved_copies: 0,
  borrow_count: i + 1,
  archived_at: null,
}));
const profile = (role) => ({
  id: id(role === "LIBRARIAN" ? 1 : 2),
  full_name: role === "LIBRARIAN" ? "Alex Morgan" : "Jamie Rivera",
  role,
  status: "ACTIVE",
  email: "reader@example.edu",
  created_at: timestamp(-100),
  student:
    role === "STUDENT"
      ? {
          id: id(2),
          student_number: "2026-0142",
          program: "Computer Science",
          year_level: 2,
          borrowing_restricted: false,
        }
      : null,
  librarian: role === "LIBRARIAN" ? { staff_number: "LIB-001" } : null,
});
const student = {
  id: id(2),
  student_number: "2026-0142",
  program: "Computer Science",
  year_level: 2,
  borrowing_restricted: false,
  profile: profile("STUDENT"),
};
const loan = {
  id: id(200),
  student_id: id(2),
  copy_id: id(300),
  borrowed_at: timestamp(-9),
  due_at: timestamp(5),
  returned_at: null,
  status: "ACTIVE",
  overdue: false,
  returned_overdue: false,
  student,
  copy: { id: id(300), barcode: "ARC-00001", book: books[0] },
};
const overdueLoan = {
  ...loan,
  id: id(201),
  borrowed_at: timestamp(-20),
  due_at: timestamp(-6),
  overdue: true,
  copy: { ...loan.copy, barcode: "ARC-00002", book: books[1] },
};
const reservation = {
  id: id(400),
  student_id: id(2),
  book_id: books[2].id,
  book: books[2],
  student,
  status: "WAITING",
  queue_position: 2,
  created_at: timestamp(-2),
  expires_at: null,
};
const eligibility = {
  eligible: true,
  reasons: [],
  active_loans: 1,
  overdue_loans: 0,
  active_reservations: 1,
  remaining_loans: 2,
  policy,
};
const report = {
  summary: {
    students: 42,
    books: 4,
    copies: 12,
    available: 6,
    borrowed: 4,
    reservations: 2,
    overdue: 1,
    returned: 24,
    damaged: 1,
    lost: 0,
  },
  monthly: Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, "0")}`,
    borrowed: i + 2,
    returned: Math.max(0, i - 1),
  })),
  popular_books: books.map((book) => ({
    id: book.id,
    title: book.title,
    count: book.borrow_count,
  })),
  active_borrowers: [
    {
      id: student.id,
      full_name: student.profile.full_name,
      student_number: student.student_number,
      count: 7,
    },
  ],
  categories: [{ ...category, count: 15 }],
};
const activity = [
  {
    id: 1,
    action: "BOOK_BORROWED",
    actor: { full_name: "Jamie Rivera" },
    entity_type: "loan",
    entity_id: loan.id,
    details: { due_at: loan.due_at },
    created_at: timestamp(-1),
  },
];
const pageOf = (items, params) => ({
  items,
  total: items.length,
  page: Number(params.get("page") || 1),
  page_size: Number(params.get("page_size") || 12),
});

export async function connectFixture(page, role = "STUDENT") {
  const user = profile(role);
  const expiration = Math.floor(Date.now() / 1000) + 86400;
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: expiration, iat: expiration - 86400, role: "authenticated", aud: "authenticated", email: user.email })}.fixture-signature`;
  const session = {
    access_token: token,
    refresh_token: "test-fixture-refresh-token",
    expires_at: expiration,
    expires_in: 86400,
    token_type: "bearer",
    user: {
      id: user.id,
      email: user.email,
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: timestamp(-100),
    },
  };
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "sb-archthea-test-auth-token",
        JSON.stringify(value),
      ),
    session,
  );
  await page.route("https://archthea-test.supabase.co/**", (route) =>
    route.fulfill({ json: session.user }),
  );
  const mutations = [];
  let reservations = [{ ...reservation }];
  let loans =
    role === "LIBRARIAN" ? [{ ...loan }, { ...overdueLoan }] : [{ ...loan }];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    const params = url.searchParams;
    if (request.method() !== "GET") {
      const body = request.postDataJSON();
      mutations.push({
        method: request.method(),
        path,
        body,
        headers: request.headers(),
      });
      if (path.endsWith("/cancel"))
        reservations = reservations.filter((item) => !path.includes(item.id));
      if (path.endsWith("/return"))
        loans = loans.filter((item) => !path.includes(item.id));
      return route.fulfill({
        json: { data: { id: id(999), status: "ACTIVE", ...body } },
      });
    }
    let data;
    if (path === "/health") data = { configured: true, status: "ok" };
    else if (path === "/me") data = user;
    else if (path === "/settings") data = policy;
    else if (path === "/categories") data = [category];
    else if (path === "/authors") data = [author];
    else if (path === "/publishers") data = [];
    else if (path === "/books") {
      let items = books.filter(
        (book) =>
          !params.get("q") ||
          `${book.title} ${author.name}`
            .toLowerCase()
            .includes(params.get("q").toLowerCase()),
      );
      if (params.get("availability") === "available")
        items = items.filter((book) => book.available_copies > 0);
      data = pageOf(items, params);
    } else if (path.match(/^\/books\/[^/]+$/))
      data = books.find((book) => path.endsWith(book.id));
    else if (path.endsWith("/copies"))
      data = pageOf(
        [
          {
            id: id(300),
            barcode: "ARC-00001",
            status: "AVAILABLE",
            condition: "GOOD",
            notes: "",
            created_at: timestamp(-50),
          },
        ],
        params,
      );
    else if (path === "/me/loans" || path === "/loans")
      data = pageOf(
        loans.filter(
          (item) =>
            !params.get("status") ||
            (params.get("status") === "OVERDUE"
              ? item.overdue
              : item.status === params.get("status")),
        ),
        params,
      );
    else if (path === "/me/reservations" || path === "/reservations")
      data = pageOf(reservations, params);
    else if (path === "/students") data = pageOf([student], params);
    else if (path.endsWith("/eligibility")) data = eligibility;
    else if (path.startsWith("/students/"))
      data = { ...student, email: student.profile.email };
    else if (path === "/notifications")
      data = pageOf(
        [
          {
            id: id(600),
            type: "DUE_SOON",
            title: "A due date is approaching",
            message: "Your book is due within two days.",
            read_at: null,
            created_at: timestamp(-1),
          },
        ],
        params,
      );
    else if (path === "/audit-logs") data = pageOf(activity, params);
    else if (path === "/dashboard/student")
      data = {
        eligibility,
        loans: [loan],
        reservations,
        history: [],
        popular: books,
        available_titles: 3,
      };
    else if (path === "/dashboard/admin")
      data = { ...report, activity, overdue: [overdueLoan], reservations };
    else if (path === "/reports") data = report;
    else if (path === "/reports/export")
      return route.fulfill({
        body: "metric,count\nbooks,4",
        contentType: "text/csv",
      });
    else
      return route.fulfill({
        status: 404,
        json: { error: { message: `No test fixture for ${path}` } },
      });
    return route.fulfill({ json: { data } });
  });
  return { mutations, user };
}
