import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

const parsed = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    HOST: z.enum(["127.0.0.1", "0.0.0.0"]).default("127.0.0.1"),
    FRONTEND_ORIGINS: z
      .string()
      .default("http://localhost:5173,http://127.0.0.1:5173"),
    SUPABASE_URL: z.union([z.url(), z.literal("")]).default(""),
    SUPABASE_PUBLISHABLE_KEY: z.string().default(""),
    SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    JOBS_INTERVAL_MS: z.coerce.number().int().min(10000).default(60000),
    RUN_SCHEDULED_JOBS: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    SERVE_FRONTEND: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .safeParse(process.env);

if (!parsed.success)
  throw new Error(
    `Invalid backend environment fields: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
  );
export const env = Object.freeze(parsed.data);
export const isConfigured = Boolean(
  env.SUPABASE_URL &&
  env.SUPABASE_PUBLISHABLE_KEY &&
  env.SUPABASE_SERVICE_ROLE_KEY,
);
