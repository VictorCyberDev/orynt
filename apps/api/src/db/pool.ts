import pg from "pg";

pg.types.setTypeParser(20, (v) => BigInt(v)); // int8 -> bigint: money is never parsed as a JS float
pg.types.setTypeParser(1700, (v) => v); // numeric stays a string

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(url: string, max = 10): Db {
  return new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 30_000, statement_timeout: 30_000 });
}

export async function withTx<T>(pool: Db, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch { /* connection may be gone */ }
    throw e;
  } finally {
    c.release();
  }
}
