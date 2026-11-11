// Reads docs/EXECUTION-REGISTER.md at build time so the home page "honest status" strip can only ever show rows
// the register itself marks VERIFIED. If the file is missing we report "none verified" (the conservative direction).
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const REGISTER_PATH = resolve(here, "../../../docs/EXECUTION-REGISTER.md");

export function readRegister() {
  if (!existsSync(REGISTER_PATH)) return { found: false, rows: [] };
  const lines = readFileSync(REGISTER_PATH, "utf8").split("\n");
  const rows = [];
  let cols = null;
  for (const line of lines) {
    if (!line.trim().startsWith("|")) {
      cols = null;
      continue;
    } // a new table starts after any non-table line
    if (cols && !cols.includes("status")) {
      /* not a status table: ignore its rows */
    }
    const cells = line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
    if (!cols) {
      cols = cells.map((c) => c.toLowerCase());
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    if (!cols.includes("status")) continue;
    const row = Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
    rows.push({
      milestone: row.milestone ?? row.m ?? "",
      workstream: row.workstream ?? "",
      status: (row.status ?? "").replace(/\*\*/g, ""),
      notes: row.notes ?? "",
    });
  }
  return { found: true, rows };
}

/** Rows whose status is exactly VERIFIED COMPLETE or VERIFIED (never PARTIALLY COMPLETE, never UNVERIFIED). */
export const verifiedRows = (reg) => reg.rows.filter((r) => /^VERIFIED\b/.test(r.status.trim()));
