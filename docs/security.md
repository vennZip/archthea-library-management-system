# Security model

## Authentication and authorization

The browser signs in with Supabase Auth and sends its access token to Express. Express calls `auth.getUser(token)`, then loads the current profile through a user-scoped client. Missing/invalid tokens receive 401; inactive, unregistered and unauthorized profiles receive 403. Roles and status are database controlled, never trusted from browser input or editable Auth metadata. Signup is disabled at the Supabase project level. A recovery link lets registered users choose their own password.

Role middleware protects every administrative endpoint. Services scope student loan and reservation reads to the verified actor. Mutation functions recheck actor role/status and student eligibility using current database records. Student profile updates accept only full_name. Administrative student updates cannot modify a role or password. Librarians can view student email through the server-side Auth Admin API.

Supabase logout removes the client session and invalidates refresh access according to the provider's session behavior. An already issued access token may remain valid until its expiry. Configure a suitably short JWT lifetime; application deactivation is checked on each protected request and blocks access independently of token age.

## Database and Storage

Application tables have RLS enabled. Authenticated clients have SELECT grants only, subject to ownership or librarian policies. Direct browser DML and execution of backend mutation RPCs are denied. Two security-definer helpers live in a private schema with fixed empty search paths; they perform RLS role/status checks without recursive policies. Mutation functions use invoker security, are callable only by service_role, and use schema-qualified identifiers.

The backend has separate user-scoped and service clients. User-scoped reads enforce RLS. The service client bypasses RLS and is used only after Express authorization for scoped reads, Auth administration, storage and validated write operations. Service-role and database credentials must never use a VITE_ prefix. Do not add direct table grants or public mutation execution to fix an integration error.

Critical circulation/inventory/account/policy functions use the same transaction-scoped advisory lock, followed by row locks. This prevents duplicate allocations, student-limit races and queue reordering. Unique partial indexes and foreign keys add independent safeguards. The global lock is a deliberate correctness-first throughput tradeoff. Database functions and audit/notification writes share one transaction; external email and Storage operations use compensation rather than claiming cross-service atomicity.

The private Storage bucket has no browser write policy. Authorized uploads go through Express: 5 MB upload limit, file-signature detection, image decoding with a pixel limit, and WebP re-encoding without original metadata. Names are server-generated. Signed cover URLs expire after one hour; already issued signed URLs remain usable until expiry.

## HTTP and data handling

Zod validates bodies, resource identifiers, pagination, sorting and filters. Unknown write fields are rejected. Catalog search uses a backend-only RPC with bound JSON arguments, so punctuation is preserved and filter syntax is treated as literal text. SQL values are passed as bound parameters; dynamic identifiers are allowlisted. CORS permits configured origins, Helmet supplies API headers, and read/write rate limits apply per client IP. Trust-proxy depth is explicit; deploy behind a known proxy only. Use a shared limiter store if scaling to multiple API processes.

Reservation jobs rotate through book UUIDs using a durable private cursor, processing at most 500 waiting lists per invocation. Earlier lists that cannot progress cannot starve later books. Due-date and pickup reminders also use bounded batches and deduplication keys. At large library sizes, set scheduling frequency to meet the desired maximum notification/expiration delay; pickup eligibility always checks the actual deadline in SQL.

Errors expose stable codes and request IDs, not SQL, tokens, stack traces or credentials. Logs contain error categories and request IDs. Successful administrative changes write an append-only application audit record. CSV exports escape quotes and neutralize spreadsheet formula prefixes. React renders descriptions as text; the application does not inject catalog HTML.

Idempotency keys protect critical circulation operations for 30 days. The browser retains a request's key after network/server failure and reuses it on retry; a successful response or definite client error clears it. A reused key with a different payload returns 409. Cancellation, archive, notification reads and retirement are designed around explicit state checks.

## Deployment checks

Run the hosted RLS and real-concurrency checks, use HTTPS, set exact frontend origins and Auth redirect URLs, configure SMTP, keep secrets outside build artifacts, enable backups and verify restoration. Apply migrations through a controlled deployment process. The API refuses production startup without complete Supabase configuration.

Reference: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [function privileges](https://supabase.com/docs/guides/database/functions), [server-side user verification](https://supabase.com/docs/reference/javascript/auth-getuser).
