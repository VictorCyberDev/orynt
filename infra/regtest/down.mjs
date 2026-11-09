#!/usr/bin/env node
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DIR } from "./lib.mjs";
const f = join(DIR, "pids.json");
if (existsSync(f)) for (const [name, pid] of Object.entries(JSON.parse(readFileSync(f, "utf8"))).reverse()) { try { process.kill(pid, "SIGTERM"); console.log(`stopped ${name} (${pid})`); } catch { /* already gone */ } }
if (process.argv.includes("--wipe")) { rmSync(DIR, { recursive: true, force: true }); console.log("wiped .regtest"); }
