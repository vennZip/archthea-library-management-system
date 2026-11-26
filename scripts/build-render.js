import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { env, isConfigured } from "../backend/src/config/env.js";

if (!isConfigured)
  throw new Error(
    "Configure the three Supabase environment values before building the hosted app.",
  );
const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
let privileged = publishableKey.startsWith("sb_secret_");
try {
  privileged ||=
    JSON.parse(
      Buffer.from(publishableKey.split(".")[1], "base64url").toString(),
    ).role === "service_role";
} catch {
  /* New publishable keys are not JWTs. */
}
if (privileged)
  throw new Error(
    "SUPABASE_PUBLISHABLE_KEY must not contain a secret or service-role key.",
  );

const buildEnv = { ...process.env };
buildEnv.NODE_ENV = "production";
// Only the public Supabase settings are passed into the frontend build.
for (const key of Object.keys(buildEnv)) {
  if (/(?:SECRET|SERVICE_ROLE|PASSWORD|ACCESS_TOKEN|API_KEY)/i.test(key))
    delete buildEnv[key];
}
buildEnv.VITE_SUPABASE_URL = env.SUPABASE_URL;
buildEnv.VITE_SUPABASE_PUBLISHABLE_KEY = publishableKey;
buildEnv.VITE_API_URL = "/api/v1";
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)),
    "build",
  ],
  {
    cwd: fileURLToPath(new URL("../frontend/", import.meta.url)),
    env: buildEnv,
    stdio: "inherit",
    windowsHide: true,
  },
);
if (result.error) throw new Error("Could not launch the frontend build.");
process.exitCode = result.status ?? 1;
