import { OryntError } from "@orynt/core";
import type { Ctx, Deps } from "./context";
/** Real-money-capable actions need a verified email when the deployment requires it (default: production). API keys inherit their creator's status. */
export async function requireVerifiedEmail(d: Deps, ctx: Ctx): Promise<void> {
  if (!d.config.requireEmailVerification || ctx.actor.kind === "system") return;
  const uid =
    ctx.actor.userId ??
    (await d.pool.query("SELECT created_by FROM api_keys WHERE id=$1", [ctx.actor.id])).rows[0]?.created_by;
  const ok =
    uid &&
    (await d.pool.query("SELECT 1 FROM users WHERE id=$1 AND email_verified_at IS NOT NULL", [uid])).rowCount;
  if (!ok)
    throw new OryntError(
      "forbidden",
      403,
      "Verify your email address first. We sent you a link when you signed up (you can request another in Settings).",
    );
}
