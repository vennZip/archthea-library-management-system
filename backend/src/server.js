import { createApp } from "./app.js";
import { env, isConfigured } from "./config/env.js";
import { serviceClient } from "./config/supabase.js";
import { LibraryRepository } from "./repositories/LibraryRepository.js";
import { startScheduler } from "./jobs/scheduler.js";

if (env.NODE_ENV === "production" && !isConfigured)
  throw new Error("Production requires complete Supabase configuration.");
const server = createApp().listen(env.PORT, env.HOST, () => {
  console.log(`Archthea API: http://127.0.0.1:${env.PORT}/api/v1/health`);
  if (!isConfigured)
    console.log(
      "Add Supabase configuration to backend/.env to enable authenticated operations.",
    );
});
const stopJobs = isConfigured
  ? startScheduler(new LibraryRepository(serviceClient), env.JOBS_INTERVAL_MS)
  : () => {};
function shutdown() {
  stopJobs();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
