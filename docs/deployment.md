# Deployment and live verification

## Free Render deployment

The root `render.yaml` deploys one free Node web service in Singapore. The React/Vite frontend and Express backend remain separate projects, but the production server serves the built frontend and `/api/v1` under one HTTPS origin. Supabase remains the existing database, authentication and private Storage provider. No database records are recreated.

1. In the existing Supabase project's SQL editor, run only `supabase/deployment/enable-cron.sql`. This enables Supabase Cron, schedules `public.run_library_jobs()` every minute and retains 14 days of its scheduler history. Do not rerun `setup.sql` against the populated project. The deployed Render process disables its in-process scheduler so jobs continue in the database while the free web service sleeps.
2. Create a Render account and authorize access to the private GitHub repository `vennZip/archthea-library-management-system`.
3. Create a **Blueprint** from that repository. It reads `render.yaml` from `main`. A shortcut is https://dashboard.render.com/select-repo?type=blueprint&repo=https://github.com/vennZip/archthea-library-management-system.
4. Render asks for `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Copy these from the existing backend/.env into Render's environment form. Never paste them in chat or commit them. The build script forwards only the public Supabase values to Vite; the service-role key is removed from the frontend build environment.
5. Deploy. Render sets the HTTPS origin, listening port, host binding, proxy trust and frontend-serving switch from the Blueprint. The build command is `npm ci --include=dev && npm run build:render`; the start command is `npm start`. Application tests are not part of this hosting build command.
6. After Render returns the actual URL, set the Supabase Auth **Site URL** to it and add `<your-render-url>/reset-password` and `<your-render-url>/auth/callback` to the allowed Redirect URLs. Existing localhost redirects can remain for local development. Email SMTP settings stay in Supabase.

The free web service can sleep after inactivity and take time to wake for its next request. Supabase Cron must be enabled for reminders and reservation expiry to run independently. Render's automatic `RENDER_EXTERNAL_URL` is used as the allowed frontend origin and password-email destination. If adding a custom domain later, update FRONTEND_ORIGINS and the Supabase Auth URL settings to match.

The service exposes `/api/v1/health` as its deployment health endpoint. `/app/...` navigation falls back to React's index.html, while missing API endpoints remain JSON errors. Hashed frontend assets have immutable caching; index.html is not cached. The hosted Content Security Policy permits only the app and the configured Supabase origin for network and cover-image access.

References: [Render Blueprints](https://render.com/docs/blueprint-spec), [Render default environment variables](https://render.com/docs/environment-variables), [free hosting limits](https://render.com/docs/free), [Supabase Cron setup](https://supabase.com/docs/guides/cron/install).

## Independent applications

Deploy the frontend as static assets and the backend as a Node.js service. Supabase remains the database, Auth and Storage provider. No additional backend framework or hosted Site runtime is required.

### Frontend

Set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and VITE_API_URL before running `npm run build`. VITE_API_URL should be the HTTPS API origin followed by `/api/v1`, or `/api/v1` when your reverse proxy forwards that path. Deploy `frontend/dist/`. Configure an SPA fallback to index.html for application routes; a Netlify `_redirects` file is included. Vite's development proxy is not a production proxy.

Configure security headers at the static host, including a Content-Security-Policy limited to your frontend/API/Supabase origins, frame-ancestors restrictions and appropriate caching. Never cache index.html indefinitely. Hashed assets can have immutable caching. No external fonts or runtime image providers are required.

### Backend

Set NODE_ENV=production, the three Supabase environment values, FRONTEND_ORIGINS to exact HTTPS frontend origins, PORT and HOST=0.0.0.0 if required by your host. Set TRUST_PROXY_HOPS only to the known proxy depth. Start with `node backend/src/server.js` from the root, or `npm start` after dependency installation. Production startup fails closed without Supabase configuration.

Alternatively build the supplied backend image from the repository root:

```sh
docker build -f backend/Dockerfile -t archthea-api .
docker run --env-file backend/.env -e NODE_ENV=production -e HOST=0.0.0.0 -p 4000:4000 archthea-api
```

The server starts reservation/reminder processing every JOBS_INTERVAL_MS. Multiple instances are safe because SQL takes the circulation lock and notifications have unique deduplication keys. A separate scheduler can invoke `npm run jobs -w backend`; coordinate scheduling to avoid unnecessary duplicate work. Monitor job-failure logs. Notifications are in-app; account setup/recovery email uses Supabase Auth.

### Database

Use Supabase CLI migrations for ongoing deployment. The generated setup.sql is a convenience for a fresh SQL-editor setup, not a migration runner. Do not reapply it to an initialized schema. Back up before future schema changes and test migrations against a staging project first.

Set the Supabase Auth Site URL and allowlisted recovery/callback URLs to the deployed frontend. Disable public signup and configure a supported email sender. Bootstrap the first librarian, then create categories, authors, books and students through the application.

## Live acceptance checklist

1. Health returns configured=true; login loads the current database profile.
2. Bootstrap/setup email and password recovery links arrive and open the correct frontend.
3. A librarian creates metadata and a book, uploads a cover, and adds a physical copy. A signed cover URL displays successfully; direct unauthenticated bucket access fails.
4. A registered student signs in, searches and filters books, borrows a copy and sees its due date.
5. A second student reserves the unavailable title. A librarian returns it and the reservation becomes ready, with a pickup deadline and notification.
6. Collection, cancellation and expiration update the queue and inventory consistently. Confirm scheduled expiration runs without an active browser.
7. Deactivation blocks subsequent API requests and releases reservations without deleting outstanding loans.
8. Student tokens cannot call admin endpoints, write application tables directly or execute mutation RPCs. Own-loan RLS hides other students' loans.
9. Reports agree with actual loans/copies. CSV export opens safely; browser print/save PDF preserves report layout.
10. Run the dedicated Supabase concurrency suite and retain its result before claiming multi-connection verification.

## Verification boundaries

Local tests cover the implementation with actual PostgreSQL SQL execution and isolated HTTP/UI test doubles. They do not establish that your hosted project has the migrations, correct Auth URLs, working SMTP, Storage permissions or deployed secrets. Those require the configured-project checks above. Docker/host deployment likewise needs the corresponding runtime to verify.
