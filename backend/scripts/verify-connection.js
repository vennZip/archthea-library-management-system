import { authClient, serviceClient } from "../src/config/supabase.js";
import { isConfigured } from "../src/config/env.js";

// Output is deliberately limited to check names and error codes. Never print
// credentials, JWTs, Auth identities, signed URLs or query response bodies.
if (!isConfigured) {
  console.error(
    "Supabase is not configured. Fill the three Supabase values in backend/.env first.",
  );
  process.exitCode = 1;
} else {
  const checks = [];
  async function check(name, action, accepts = (result) => !result.error) {
    try {
      const result = await action();
      const passed = accepts(result);
      checks.push({
        check: name,
        passed,
        ...(passed
          ? {}
          : { error_code: result.error?.code ?? "UNEXPECTED_RESULT" }),
      });
    } catch {
      checks.push({
        check: name,
        passed: false,
        error_code: "CONNECTION_FAILED",
      });
    }
  }
  await check("Library settings and service-role database access", () =>
    serviceClient.from("library_settings").select("id").eq("id", true).single(),
  );
  await check("Application profile schema", () =>
    serviceClient.from("profiles").select("id").limit(1),
  );
  await check(
    "Catalog search migration",
    () => serviceClient.rpc("search_catalog", { p_actor: null, p_query: {} }),
    (result) =>
      result.error?.code === "P0001" &&
      result.error?.message === "ACCOUNT_INACTIVE",
  );
  await check("Supabase Auth administration", () =>
    serviceClient.auth.admin.listUsers({ page: 1, perPage: 1 }),
  );
  await check(
    "Private book-cover bucket",
    () => serviceClient.storage.getBucket("book-covers"),
    (result) => !result.error && result.data?.public === false,
  );
  await check(
    "Anonymous table access denied",
    () => authClient.from("books").select("id").limit(1),
    (result) => result.error?.code === "42501",
  );
  await check(
    "Anonymous backend RPC execution denied",
    () => authClient.rpc("search_catalog", { p_actor: null, p_query: {} }),
    (result) => result.error?.code === "42501",
  );
  for (const result of checks) console.log(JSON.stringify(result));
  if (checks.some((result) => !result.passed)) process.exitCode = 1;
}
