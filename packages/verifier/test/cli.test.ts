import { describe, expect, it, beforeAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildFixture } from "./fixture";

const cli = resolve(__dirname, "../dist/orynt-verify.mjs");
const run = (args: string[]) => spawnSync("node", [cli, ...args], { encoding: "utf8" });
let dir: string, real: ReturnType<typeof buildFixture>, sim: ReturnType<typeof buildFixture>;
beforeAll(() => {
  execFileSync("node", [resolve(__dirname, "../build.mjs")], { cwd: resolve(__dirname, "..") });
  dir = mkdtempSync(join(tmpdir(), "orynt-cli-"));
  real = buildFixture({ approvals: 2 }); sim = buildFixture({ simulator: true });
  writeFileSync(join(dir, "real.json"), JSON.stringify(real.receipt, null, 2));
  writeFileSync(join(dir, "sim.json"), JSON.stringify(sim.receipt));
  writeFileSync(join(dir, "tampered.json"), JSON.stringify(real.receipt, null, 2).replace("Design work, October", "Design work, Octobex"));
});
describe("orynt-verify CLI (the built, standalone bundle)", () => {
  it("exit 0 VERIFIED with the trusted issuer key", () => { const r = run([join(dir, "real.json"), "--trust-key", real.issuer.publicKey, "--require-real"]); expect(r.status).toBe(0); expect(r.stdout).toMatch(/VERDICT: VERIFIED/); });
  it("exit 3 when no trust root is supplied", () => expect(run([join(dir, "real.json")]).status).toBe(3));
  it("exit 1 for a receipt changed by one character", () => { const r = run([join(dir, "tampered.json"), "--trust-key", real.issuer.publicKey]); expect(r.status).toBe(1); expect(r.stdout).toMatch(/REJECTED/); });
  it("exit 1 for the wrong trust key (forged issuer)", () => expect(run([join(dir, "real.json"), "--trust-key", "ab".repeat(32)]).status).toBe(1));
  it("exit 4 for simulator receipts, and 1 with --require-real", () => { expect(run([join(dir, "sim.json"), "--trust-key", sim.issuer.publicKey]).status).toBe(4); expect(run([join(dir, "sim.json"), "--trust-key", sim.issuer.publicKey, "--require-real"]).status).toBe(1); });
  it("replay ledger rejects the second presentation", () => { const seen = join(dir, "seen.txt"); const a = run([join(dir, "real.json"), "--trust-key", real.issuer.publicKey, "--seen-file", seen]); const b = run([join(dir, "real.json"), "--trust-key", real.issuer.publicKey, "--seen-file", seen]); expect(a.status).toBe(0); expect(b.status).toBe(1); expect(b.stdout).toMatch(/replay/); });
  it("exit 2 on unreadable input", () => expect(run([join(dir, "nope.json")]).status).toBe(2));
});
