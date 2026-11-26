# Archthea architecture

Approved stack: React + Vite, Express 5, Supabase Auth, PostgreSQL and Storage. The browser uses Supabase only for authentication and sends bearer tokens to Express for application operations. Express verifies identity, loads the current active profile, authorizes the action, validates input, and delegates to services and repositories.

## Boundaries

- Controllers translate HTTP; services enforce use cases; repositories encapsulate data access.
- User-scoped clients enforce RLS for reads. A separate server-only service client performs authorized writes.
- Critical database RPC functions are executable only by `service_role`. They validate the verified actor again and atomically enforce circulation rules, inventory transitions, notifications, idempotency and audit logging.
- A private schema holds security helpers. No password is stored outside Supabase Auth. Role assignment never comes from user-editable metadata.
- All timestamps are UTC; the configured library timezone controls presentation.

## Invariants

One active loan per copy, one active reservation per student/book, one active pickup allocation per copy. Inventory counts and overdue status are derived. Waiting position is ordered by creation timestamp and UUID. Loans retain their original due date when settings change. History is preserved through archiving and copy retirement.

All circulation operations acquire a transaction-level circulation advisory lock before row locks. This deliberately serializes the short circulation mutations across the library, making limit checks, FIFO promotion and inventory transitions race-safe with a consistent lock order. It is an appropriate correctness-first choice for an academic or small institutional library; partitioned locks can replace it after measuring throughput. Inventory edits, policy changes and student deactivation use the same lock. Normal reads remain concurrent.

## OOP

Repositories define a small data-access contract; SupabaseRepository implements it. Services receive repositories through dependency injection and encapsulate dependencies with private fields. Application errors extend AppError and override public error metadata. The centralized handler consumes the common contract. Composition is used for business capabilities.

## Delivery gates

1. Architecture approval (received).
2. Schema, transaction functions, security and database tests.
3. Workspace, API and frontend foundation.
   4–9. Auth, RBAC, catalog, inventory, circulation, queues and students.
   10–12. Role dashboards, reports, policy management, notifications and audit UI.
   13–15. Integration, responsive/accessibility refinement, tests and deployment documentation.

Local PostgreSQL tests use PGlite, which runs the real PostgreSQL engine but has one connection. Multi-connection contention tests must run separately against a local or dedicated Supabase test project. Supabase Auth and Storage need a configured Supabase project for live verification. Test doubles never supply application data in production.
