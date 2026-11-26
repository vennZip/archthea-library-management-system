# Archthea Library Management System

A React + Vite frontend, an independent Express API, and Supabase Authentication, PostgreSQL and private Storage. Includes student and librarian workspaces, physical-copy inventory, transactional loans, FIFO reservations, notifications, reporting, configurable policies and audit logs.

The application has **no mock-data fallback or authentication bypass**. Without Supabase configuration, the public site works and sign-in displays a connection notice. Browser test fixtures are isolated under `tests/e2e/`.

## Start locally

Use Node.js 26, or a supported Node.js version matching the root package's engine requirement. Chrome is used for local browser tests; Edge is also supported.

```powershell
npm.cmd ci
# First setup only; keep existing .env files if you have already configured them.
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Enter these values locally. **Do not paste secret keys into chat or commit them.**

| File            | Values                                                                  |
| --------------- | ----------------------------------------------------------------------- |
| `frontend/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`                    |
| `backend/.env`  | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |

The project URL and publishable key must refer to the same Supabase project in both files. The backend service-role key must stay exclusively on the server. Legacy Supabase anon keys can be used in the publishable-key fields.

### Set up Supabase

1. Use a fresh Supabase project, or inspect an existing project before applying the application schema.
2. Run the SQL migrations in `supabase/migrations/` **in filename order** through the Supabase SQL editor. Alternatively run `npm.cmd run db:bundle` and execute `supabase/setup.sql` once in a fresh project. The migrations create application tables, RLS, transactional RPCs and a private `book-covers` bucket. Do not run the bundle again after applying the individual migrations.
3. In **Authentication → URL Configuration**, set the Site URL to `http://127.0.0.1:5173`. Allow `http://127.0.0.1:5173/reset-password` and `http://127.0.0.1:5173/auth/callback`. Add the corresponding `localhost` URLs if you use that hostname.
4. Disable public user signup and set the minimum password length to 12 characters. Students are registered by librarians through the API. Configure a working email sender; use custom SMTP for deployment.
5. Create the first librarian:

```powershell
npm.cmd run bootstrap:admin -- --email librarian@example.edu --name "Library Administrator" --staff LIB-001
```

The script creates a new Auth identity and a librarian profile atomically at the application level, then sends a password setup email. It refuses to run once a librarian exists. The profile transaction is atomic; Auth identity creation is an external operation with compensation on database failure. No password is printed, generated or stored by the application. If email delivery fails after registration, use **Forgot password**.

For a local development account with a test email address, `node backend/scripts/local-admin-access.js --email your-test-address` can set a strong generated password for the sole existing librarian and confirm that test identity without email. It refuses production mode, verifies the email, saves credentials only in ignored `backend/.env.local-admin`, and never overwrites an existing credential file. This is a development helper, not a public application endpoint. Open that file locally to sign in, then use **My account → Change my password**. Production account registration and password recovery still require a working email sender.

6. Start the two applications:

```powershell
npm.cmd run dev
```

After configuring Supabase and applying the schema, run `npm.cmd run verify:connection` to check database/schema access, Auth administration, the private cover bucket and anonymous access restrictions without printing credentials or user data. This diagnostic does not replace the complete live acceptance checklist in the deployment guide.

- Frontend: **http://127.0.0.1:5173**
- API health: **http://127.0.0.1:4000/api/v1/health**

Restart the API after changing backend environment variables. Vite restarts for frontend environment changes. Login as the librarian, add categories/authors through **Catalog details**, add books and physical copies, then register students. No initial catalog or student records are fabricated.

For Linux/macOS, use `npm` instead of `npm.cmd`. The Supabase CLI configuration is included for developers who have Docker and prefer `supabase start` and migration-based local development.

## Features

| Student workspace                                                                 | Librarian workspace                                                                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Dashboard with current loans, due dates and waiting positions                     | Operational dashboard, overdue list, trends and activity                                  |
| Search title, author or ISBN; filter category, availability and publication years | Add/edit/archive/restore books; manage authors, publishers and categories                 |
| Borrow available copies and collect ready reservations                            | Register students, edit enrollment information, activate/deactivate and restrict accounts |
| Reserve unavailable titles and cancel reservations                                | Manage barcodes, copy conditions, damage, loss, maintenance and retirement                |
| Borrowing history and permitted profile edits                                     | Process checkouts and returns; manage reservations and pickup holds                       |
| In-app confirmations, due reminders and pickup alerts                             | Configure borrowing rules; view audit logs; export CSV and print/save reports as PDF      |

Both workspaces support keyboard navigation, focus-trapped dialogs, responsive navigation, loading and error feedback, and reduced motion. GSAP/ScrollTrigger animates the landing page; Framer Motion handles application transitions and dialogs.

## Verification

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

- Vitest, Supertest and React Testing Library cover SQL rules, RLS, service behavior, HTTP authorization, rollback, uploads, notifications, focus handling and retry safety.
- SQL tests execute the migrations and PL/pgSQL functions in **PGlite**, a real embedded PostgreSQL engine. Auth and Storage system tables are minimal test scaffolding; this does not verify the hosted Supabase Auth or Storage services.
- Playwright exercises desktop, tablet and mobile using isolated network/Auth fixtures. It covers checkout, cancellation, returns, inventory, registration, policy edits, reports, API failures and accessibility. These tests do not replace live integration testing.
- Test screenshots are saved under `.tmp/qa/`; failure traces are under `test-results/`. These directories are ignored.
- For Edge: set `$env:PLAYWRIGHT_CHANNEL='msedge'` before browser tests. Linux CI installs Playwright Chromium automatically.

### Real concurrent transactions

Copy `backend/.env.concurrency.example` to `backend/.env.concurrency` and configure a **dedicated Supabase test project with the migrations applied**, then explicitly set `CONFIRM_DEDICATED_TEST_PROJECT=yes` in that file.

```powershell
npm.cmd run test:concurrency
```

This verifies competing borrowers for one copy, concurrent requests against a student's borrowing limit, and duplicate reservations. It creates scoped test identities/records, temporarily changes the test borrowing limit, restores settings, and removes its fixtures. Never point it at the live library project. PGlite is single-connection and cannot verify real multi-connection contention.

## Documentation

- [Architecture and OOP decisions](docs/architecture.md)
- [Database relationships and workflows](docs/workflows.md)
- [Generated OpenAPI 3.1 specification](docs/openapi.json)
- [Security model](docs/security.md)
- [Deployment and live verification](docs/deployment.md)

Regenerate the API contract with `npm.cmd run docs:api` and the SQL-editor bundle with `npm.cmd run db:bundle`. `npm.cmd run format:check` checks formatting. GitHub Actions runs unit/integration tests, a production build and responsive browser checks.
