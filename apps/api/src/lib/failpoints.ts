/**
 * Deterministic fault injection for adversarial tests and the demo. Disabled unless ORYNT_FAILPOINTS=1 (and refused in production).
 * A failpoint is armed by name; the next time the code passes `await fp(name)` it throws, delays or kills the process — once.
 */
export type FpAction = "throw" | "exit" | "delay";
const armed = new Map<string, { action: FpAction; ms?: number }>();
let enabled = false;
export const failpointsEnabled = () => enabled;
export function enableFailpoints(v: boolean) { enabled = v; if (!v) armed.clear(); }
export function arm(name: string, action: FpAction = "throw", ms?: number) { if (!enabled) throw new Error("failpoints are disabled"); armed.set(name, { action, ms }); }
export function disarmAll() { armed.clear(); }
export function listArmed() { return [...armed.entries()].map(([name, v]) => ({ name, ...v })); }
export class FailpointError extends Error { constructor(public readonly point: string) { super(`failpoint triggered: ${point}`); this.name = "FailpointError"; } }
export async function fp(name: string): Promise<void> {
  if (!enabled) return;
  const a = armed.get(name);
  if (!a) return;
  armed.delete(name);
  if (a.action === "exit") { process.stderr.write(`[failpoint] ${name}: killing process (simulated SIGKILL)\n`); process.kill(process.pid, "SIGKILL"); }
  if (a.action === "delay") { await new Promise((r) => setTimeout(r, a.ms ?? 1000)); return; }
  throw new FailpointError(name);
}
