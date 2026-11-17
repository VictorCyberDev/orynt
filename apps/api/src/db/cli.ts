import { loadConfig } from "../config";
import { createPool } from "./pool";
import { migrateDown, migrateUp, pendingMigrations } from "./migrate";

const cmd = process.argv[2] ?? "up";
const pool = createPool(loadConfig().databaseUrl, 2);
try {
  if (cmd === "up") console.log("applied:", await migrateUp(pool));
  else if (cmd === "down") console.log("reverted:", await migrateDown(pool, Number(process.argv[3] ?? 1)));
  else if (cmd === "status") console.log("pending:", await pendingMigrations(pool));
  else throw new Error("usage: cli.ts up|down [n]|status");
} finally {
  await pool.end();
}
