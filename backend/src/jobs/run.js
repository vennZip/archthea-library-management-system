import { serviceClient } from "../config/supabase.js";
import { LibraryRepository } from "../repositories/LibraryRepository.js";

try {
  const result = await new LibraryRepository(serviceClient).rpc(
    "run_library_jobs",
  );
  console.log(JSON.stringify(result));
} catch {
  console.error(
    "Library job failed. Check backend configuration and database migrations.",
  );
  process.exitCode = 1;
}
