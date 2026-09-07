// One-shot demo seed for fresh Docker deployments. Runs db/seed.sql as a
// single multi-statement query (node-postgres supports that). Safe to run
// once; re-runs fail on fixed-id primary keys and exit 0 deliberately.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(root, "db", "seed.sql"), "utf8");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query(sql);
  console.log("[seed] demo data applied");
} catch (e) {
  console.log("[seed] skipped:", e instanceof Error ? e.message.slice(0, 160) : e);
} finally {
  await client.end().catch(() => {});
}
