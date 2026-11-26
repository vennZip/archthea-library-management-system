import { parseArgs } from "node:util";
import { z } from "zod";
import { env } from "../src/config/env.js";
import { serviceClient } from "../src/config/supabase.js";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    staff: { type: "string" },
  },
});
const parsed = z
  .object({
    email: z.email(),
    name: z.string().min(2).max(120),
    staff: z.string().min(2).max(40),
  })
  .safeParse(values);
if (!parsed.success || !serviceClient) {
  console.error(
    'Configure backend/.env, apply the migrations, then run: npm run bootstrap:admin -- --email librarian@example.edu --name "Library Administrator" --staff LIB-001',
  );
  process.exitCode = 1;
} else {
  const { email, name, staff } = parsed.data;
  const { count, error: lookupError } = await serviceClient
    .from("librarian_profiles")
    .select("*", { count: "exact", head: true });
  if (lookupError || count)
    throw new Error(
      "Bootstrap requires applied migrations and no existing librarian.",
    );
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    email_confirm: false,
  });
  if (error)
    throw new Error(
      "Could not create a new Auth identity. Use an email that is not already registered.",
    );
  const { error: profileError } = await serviceClient.rpc(
    "bootstrap_first_librarian",
    { p_id: data.user.id, p_name: name, p_staff: staff },
  );
  if (profileError) {
    const { error: cleanupError } = await serviceClient.auth.admin.deleteUser(
      data.user.id,
    );
    if (cleanupError)
      console.error(
        "Auth identity cleanup is required in the Supabase dashboard.",
      );
    throw new Error(
      "Librarian profile creation failed. Check migrations and profile constraints.",
    );
  }
  const redirectTo = `${env.FRONTEND_ORIGINS.split(",")[0].trim()}/reset-password`;
  const { error: mailError } = await serviceClient.auth.resetPasswordForEmail(
    email,
    { redirectTo },
  );
  console.log(
    mailError
      ? "Librarian created. Use Forgot password on the login page to request a password setup email."
      : "Librarian created. Check your email to choose a password.",
  );
}
