import { Bolt11Error, OryntError, decodeInvoice, sha256Hex, toMsat, type Network } from "@orynt/core";
import { safeGetJson } from "../lib/ssrf";
import type { Deps } from "./context";

/**
 * LNURL-pay / Lightning Address (LUD-06, LUD-16). The server we fetch from is UNTRUSTED: whatever invoice it returns is verified here
 * (amount, network, expiry, and that the invoice commits to the advertised metadata via the description hash) before it can reach approval.
 * The node key that signed the invoice is surfaced for the approver; a name or domain alone is never treated as proof of destination.
 */
const ADDRESS = /^([a-z0-9._+-]{1,64})@([a-z0-9.-]{1,253}\.[a-z]{2,63})$/i;
const DEV_ADDRESS = /^([a-z0-9._+-]{1,64})@(127\.0\.0\.1:\d{2,5})$/i;
export async function resolveLightningAddress(
  d: Deps,
  address: string,
  amountMsatInput: string,
  expectedNetwork: Network,
) {
  const m =
    ADDRESS.exec(address.trim()) ??
    (d.config.allowPrivateWebhookTargets ? DEV_ADDRESS.exec(address.trim()) : null); // loopback-with-port form exists for local test servers only
  if (!m)
    throw new OryntError(
      "validation_failed",
      422,
      "That doesn't look like a Lightning address (name@domain).",
    );
  const amountMsat = (() => {
    try {
      return toMsat(amountMsatInput);
    } catch {
      throw new OryntError("validation_failed", 422, "Amount is not valid.");
    }
  })();
  if (amountMsat <= 0n) throw new OryntError("validation_failed", 422, "Amount must be greater than zero.");
  const fail = (msg: string): never => {
    throw new OryntError("invoice_invalid", 422, `${address}: ${msg}`);
  };
  const base = `https://${m[2]}/.well-known/lnurlp/${encodeURIComponent(m[1]!)}`;
  const urlFor = (u: string) =>
    d.config.allowPrivateWebhookTargets && /^(localhost|127\.0\.0\.1)(:|$)/.test(m[2]!)
      ? u.replace("https://", "http://")
      : u; // dev only: local test servers
  let meta: Record<string, unknown>;
  try {
    meta = (await safeGetJson(urlFor(base), d.config.allowPrivateWebhookTargets)) as Record<string, unknown>;
  } catch (e) {
    return fail(`could not fetch the payment details (${(e as Error).message}).`);
  }
  if (
    meta["tag"] !== "payRequest" ||
    typeof meta["callback"] !== "string" ||
    typeof meta["metadata"] !== "string"
  )
    return fail("the server did not return a valid LNURL-pay response.");
  const min = BigInt(String(meta["minSendable"] ?? "0")),
    max = BigInt(String(meta["maxSendable"] ?? "0"));
  if (amountMsat < min || amountMsat > max)
    return fail(`the amount is outside what this recipient accepts (${min}–${max} msat).`);
  let cb: URL;
  try {
    cb = new URL(meta["callback"] as string);
  } catch {
    return fail("the callback address is invalid.");
  }
  cb.searchParams.set("amount", amountMsat.toString());
  let res: Record<string, unknown>;
  try {
    res = (await safeGetJson(cb.toString(), d.config.allowPrivateWebhookTargets)) as Record<string, unknown>;
  } catch (e) {
    return fail(`could not obtain an invoice (${(e as Error).message}).`);
  }
  if (res["status"] === "ERROR" || typeof res["pr"] !== "string")
    return fail(
      `the server refused: ${typeof res["reason"] === "string" ? (res["reason"] as string).slice(0, 120) : "no invoice returned"}.`,
    );
  let inv;
  try {
    inv = decodeInvoice(res["pr"]);
  } catch (e) {
    return fail(`the invoice is invalid: ${e instanceof Bolt11Error ? e.message : "unreadable"}.`);
  }
  if (inv.network !== expectedNetwork)
    throw new OryntError(
      "network_mismatch",
      422,
      `The invoice is for ${inv.network}, but your wallet is on ${expectedNetwork}.`,
    );
  if (inv.amountMsat !== amountMsat)
    return fail(
      `the server returned an invoice for ${inv.amountMsat ?? "an open"} msat, not the ${amountMsat} msat requested. Refusing.`,
    );
  if (inv.descriptionHash !== sha256Hex(meta["metadata"] as string))
    return fail(
      "the invoice does not commit to the advertised payment details (description hash mismatch). Refusing: this is what a substituted invoice looks like.",
    );
  if (inv.expiresAt * 1000 <= Date.now() + 30_000)
    return fail("the invoice has expired or expires too soon.");
  let description = "";
  try {
    description = String(
      (JSON.parse(meta["metadata"] as string) as [string, string][]).find(
        (x) => x[0] === "text/plain",
      )?.[1] ?? "",
    );
  } catch {
    /* keep empty */
  }
  return {
    invoice: res["pr"] as string,
    amount_msat: inv.amountMsat!.toString(),
    payee_pubkey: inv.payeePubkey,
    network: inv.network,
    description: description.slice(0, 200),
    expires_at: new Date(inv.expiresAt * 1000).toISOString(),
    verified: { amount_matches: true, description_hash_matches: true, signature_valid: true },
  };
}
