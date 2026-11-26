import { readdir, readFile, writeFile } from "node:fs/promises";

const directory = new URL("../supabase/migrations/", import.meta.url);
const migrations = (await readdir(directory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const sections = await Promise.all(
  migrations.map(
    async (file) =>
      `-- ${file}\n${await readFile(new URL(file, directory), "utf8")}`,
  ),
);
await writeFile(
  new URL("../supabase/setup.sql", import.meta.url),
  "-- Archthea: run ONCE in the SQL editor of a fresh Supabase project.\n-- For managed deployments prefer the individual CLI migrations.\n\n" +
    sections.join("\n\n"),
);
console.log(`Bundled ${migrations.length} migrations into supabase/setup.sql.`);
