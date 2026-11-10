/** Test/demo helpers for the PAYEE side of a regtest payment (creating invoices on a second LND node). Not used by the control plane. */
import https from "node:https";
import { Buffer } from "node:buffer";
import type { LndConfig } from "./lnd";

async function call(cfg: LndConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<Record<string, unknown>> {
  const u = new URL(path, cfg.restUrl);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method, hostname: u.hostname, port: u.port, path: u.pathname + u.search, ca: cfg.tlsCertPem,
        headers: { "Grpc-Metadata-macaroon": cfg.macaroonHex, ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}) } },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(d || "{}");
            if ((res.statusCode ?? 500) >= 400) reject(new Error(`LND ${path} ${res.statusCode}: ${JSON.stringify(j)}`));
            else resolve(j);
          } catch (e) { reject(e); }
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export interface CreatedInvoice { paymentRequest: string; paymentHash: string; addIndex: string }
export async function lndAddInvoice(cfg: LndConfig, valueMsat: bigint, memo: string, expirySeconds = 3600, descriptionHashHex?: string): Promise<CreatedInvoice> {
  const r = await call(cfg, "POST", "/v1/invoices", { value_msat: valueMsat.toString(), ...(descriptionHashHex ? { description_hash: Buffer.from(descriptionHashHex, "hex").toString("base64") } : { memo }), expiry: String(expirySeconds) });
  return { paymentRequest: String(r["payment_request"]), paymentHash: Buffer.from(String(r["r_hash"]), "base64").toString("hex"), addIndex: String(r["add_index"]) };
}
export async function lndLookupInvoice(cfg: LndConfig, paymentHashHex: string): Promise<{ state: string; settled: boolean; amtPaidMsat: bigint; preimage: string }> {
  const r = await call(cfg, "GET", `/v1/invoice/${paymentHashHex}`);
  return { state: String(r["state"]), settled: r["state"] === "SETTLED", amtPaidMsat: BigInt(String(r["amt_paid_msat"] ?? "0")), preimage: Buffer.from(String(r["r_preimage"] ?? ""), "base64").toString("hex") };
}
export async function lndChannelBalance(cfg: LndConfig): Promise<{ localMsat: bigint; remoteMsat: bigint }> {
  const r = (await call(cfg, "GET", "/v1/balance/channels")) as { local_balance?: { msat?: string }; remote_balance?: { msat?: string } };
  return { localMsat: BigInt(r.local_balance?.msat ?? "0"), remoteMsat: BigInt(r.remote_balance?.msat ?? "0") };
}
export async function lndActiveChannels(cfg: LndConfig): Promise<number> {
  const r = (await call(cfg, "GET", "/v1/channels")) as { channels?: Array<{ active?: boolean }> };
  return (r.channels ?? []).filter((c) => c.active).length;
}
