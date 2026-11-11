import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./pool";

const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const LOCK_ID = 727_474_001;

interface Mig {
  version: string;
  name: string;
  up: string;
  down: string;
  checksum: string;
}
export function loadMigrations(d: string = dir): Mig[] {
  const files = readdirSync(d)
    .filter((f) => f.endsWith(".up.sql"))
    .sort();
  return files.map((f) => {
    const m = /^(\d+)_(.+)\.up\.sql$/.exec(f)!;
    const up = readFileSync(join(d, f), "utf8");
    const down = readFileSync(join(d, f.replace(".up.sql", ".down.sql")), "utf8");
    return { version: m[1]!, name: m[2]!, up, down, checksum: createHash("sha256").update(up).digest("hex") };
  });
}

async function ensureTable(pool: Db) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
}

/** Applies pending migrations, each in its own transaction, under an advisory lock. A failed migration leaves no partial state. */
export async function migrateUp(pool: Db, migrationsDir?: string): Promise<string[]> {
  const c = await pool.connect();
  const applied: string[] = [];
  try {
    await c.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await ensureTable(pool);
    const done = new Map(
      (await c.query("SELECT version, checksum FROM schema_migrations")).rows.map((r) => [
        r.version as string,
        r.checksum as string,
      ]),
    );
    for (const m of loadMigrations(migrationsDir)) {
      const prior = done.get(m.version);
      if (prior) {
        if (prior !== m.checksum)
          throw new Error(
            `migration ${m.version}_${m.name} was modified after being applied (checksum drift)`,
          );
        continue;
      }
      try {
        await c.query("BEGIN");
        await c.query(m.up);
        await c.query("INSERT INTO schema_migrations(version,name,checksum) VALUES ($1,$2,$3)", [
          m.version,
          m.name,
          m.checksum,
        ]);
        await c.query("COMMIT");
        applied.push(m.version);
      } catch (e) {
        await c.query("ROLLBACK");
        throw new Error(
          `migration ${m.version}_${m.name} failed and was rolled back: ${(e as Error).message}`,
        );
      }
    }
    return applied;
  } finally {
    try {
      await c.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
    } catch {
      /* ignore */
    }
    c.release();
  }
}

export async function migrateDown(pool: Db, steps = 1, migrationsDir?: string): Promise<string[]> {
  const c = await pool.connect();
  const reverted: string[] = [];
  try {
    await c.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await ensureTable(pool);
    const rows = (
      await c.query("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT $1", [steps])
    ).rows;
    const all = new Map(loadMigrations(migrationsDir).map((m) => [m.version, m]));
    for (const r of rows) {
      const m = all.get(r.version)!;
      await c.query("BEGIN");
      try {
        await c.query(m.down);
        await c.query("DELETE FROM schema_migrations WHERE version=$1", [m.version]);
        await c.query("COMMIT");
        reverted.push(m.version);
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    }
    return reverted;
  } finally {
    try {
      await c.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
    } catch {
      /* ignore */
    }
    c.release();
  }
}

export async function pendingMigrations(pool: Db): Promise<string[]> {
  await ensureTable(pool);
  const done = new Set(
    (await pool.query("SELECT version FROM schema_migrations")).rows.map((r) => r.version),
  );
  return loadMigrations()
    .filter((m) => !done.has(m.version))
    .map((m) => m.version);
}
