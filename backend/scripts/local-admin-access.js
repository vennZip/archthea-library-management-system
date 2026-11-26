import { parseArgs } from "node:util";
import { randomBytes } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { env, isConfigured } from "../src/config/env.js";
import { serviceClient, authClient } from "../src/config/supabase.js";

// Explicit local-development operation. The password never enters command-line
// arguments, console output, the frontend bundle or application profile tables.
const { values } = parseArgs({ options: { email: { type: "string" } } });
const credentialPath = fileURLToPath(
  new URL("../.env.local-admin", import.meta.url),
);
let createdFile = false;
let accountUpdated = false;
let signedIn = false;
try {
  if (env.NODE_ENV === "production" || !isConfigured || !values.email)
    throw new Error("LOCAL_SETUP_NOT_CONFIGURED");
  const { data: librarians, error: lookupError } = await serviceClient
    .from("librarian_profiles")
    .select("id")
    .limit(2);
  if (lookupError || librarians?.length !== 1)
    throw new Error("EXACTLY_ONE_LIBRARIAN_REQUIRED");
  const id = librarians[0].id;
  const { data: identity, error: identityError } =
    await serviceClient.auth.admin.getUserById(id);
  if (
    identityError ||
    identity.user.email?.toLowerCase() !== values.email.toLowerCase()
  )
    throw new Error("ACCOUNT_EMAIL_MISMATCH");
  const password = `At!${randomBytes(24).toString("base64url")}9`;
  await writeFile(
    credentialPath,
    `ADMIN_EMAIL=${values.email}\nADMIN_PASSWORD=${password}\n`,
    { flag: "wx", mode: 0o600 },
  );
  createdFile = true;
  // The user chose a test address and local password setup. Confirm this test
  // identity without relying on delivery to that mailbox.
  const { error: updateError } = await serviceClient.auth.admin.updateUserById(
    id,
    { password, email_confirm: true },
  );
  if (updateError) throw new Error(updateError.code || "PASSWORD_SETUP_FAILED");
  accountUpdated = true;
  const { data: login, error: loginError } =
    await authClient.auth.signInWithPassword({ email: values.email, password });
  if (loginError || !login.session)
    throw new Error(loginError?.code || "SIGN_IN_FAILED");
  signedIn = true;
  console.log(
    JSON.stringify({ check: "Real Supabase password sign-in", passed: true }),
  );
  const paths = [
    "/me",
    "/dashboard/admin",
    "/books?page_size=1",
    "/categories",
    "/authors",
    "/publishers",
    "/loans?page_size=1",
    "/reservations?page_size=1",
    "/students?page_size=1",
    "/notifications?page_size=1",
    "/settings",
    "/reports",
    "/audit-logs?page_size=1",
  ];
  let failed = false;
  for (const path of paths) {
    const response = await fetch(`http://127.0.0.1:${env.PORT}/api/v1${path}`, {
      headers: { Authorization: `Bearer ${login.session.access_token}` },
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => ({}));
    const passed =
      response.ok && (path !== "/me" || body.data?.role === "LIBRARIAN");
    console.log(
      JSON.stringify({
        check: `Authenticated GET ${path}`,
        passed,
        status: response.status,
        ...(passed ? {} : { error_code: body.error?.code || "REQUEST_FAILED" }),
      }),
    );
    if (!passed) failed = true;
  }
  console.log(
    "Local login details saved in backend/.env.local-admin. No password or session token was printed.",
  );
  if (failed) process.exitCode = 1;
} catch (error) {
  if (createdFile && !accountUpdated) await unlink(credentialPath);
  console.error(
    JSON.stringify({
      check: "Local librarian access",
      passed: false,
      error_code:
        error.code === "EEXIST"
          ? "LOCAL_CREDENTIAL_FILE_ALREADY_EXISTS"
          : error.message,
    }),
  );
  process.exitCode = 1;
} finally {
  if (signedIn) await authClient.auth.signOut({ scope: "local" });
}
