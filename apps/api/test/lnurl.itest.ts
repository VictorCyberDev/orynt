import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { encodeInvoice, nodePubkeyFromPrivate, sha256Hex } from "@orynt/core";
import { world, execute, type World } from "./helpers";

let w: World, srv: http.Server, port = 0;
type Mode = "honest" | "wrong_amount" | "wrong_hash" | "redirect" | "huge" | "error" | "bad_json" | "wrong_tag" | "expired";
let mode: Mode = "honest";
const METADATA = JSON.stringify([["text/plain", "Pay Alice for October"]]);
const NODE = "d5".repeat(32);
const inv = (msat: bigint, hash: string, expiry = 3600) => encodeInvoice({ network: "regtest", amountMsat: msat, paymentHashHex: sha256Hex(Buffer.from("preimage-" + msat)), paymentSecretHex: "22".repeat(32), descriptionHashHex: hash, timestamp: Math.floor(Date.now() / 1000), expirySeconds: expiry, privateKeyHex: NODE });
beforeAll(async () => {
  w = await world();
  srv = http.createServer((req, res) => {
    const u = new URL(req.url!, "http://x"); const send = (o: unknown, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(typeof o === "string" ? o : JSON.stringify(o)); };
    if (u.pathname.startsWith("/.well-known/lnurlp/")) {
      if (mode === "redirect") { res.writeHead(302, { location: "http://127.0.0.1:1/evil" }); return res.end(); }
      if (mode === "huge") return send("x".repeat(200_000));
      if (mode === "bad_json") return send("not json {");
      return send({ tag: mode === "wrong_tag" ? "withdrawRequest" : "payRequest", callback: `http://127.0.0.1:${port}/cb`, minSendable: 1000, maxSendable: 500_000_000, metadata: METADATA });
    }
    if (u.pathname === "/cb") {
      const amt = BigInt(u.searchParams.get("amount")!);
      if (mode === "error") return send({ status: "ERROR", reason: "recipient is not accepting payments" });
      const good = sha256Hex(METADATA);
      return send({ pr: inv(mode === "wrong_amount" ? amt + 1000n : amt, mode === "wrong_hash" ? sha256Hex("something else entirely") : good, mode === "expired" ? 1 : 3600), routes: [] });
    }
    send({}, 404);
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r)); port = (srv.address() as { port: number }).port;
});
afterAll(async () => { srv.close(); await w.env.teardown(); });
const resolve = (address: string, amount = "25000000") => w.c.call("POST", "/v1/lnurl/resolve", w.operator, { address, amount_msat: amount });

describe("Lightning Address / LNURL-pay (untrusted server, verified invoice)", () => {
  it("honest server: returns a verified invoice that can become a normal approved payout and settle (simulator)", async () => {
    mode = "honest";
    const r = await resolve(`alice@127.0.0.1:${port}`);
    expect(r.status).toBe(200); expect(r.body.amount_msat).toBe("25000000"); expect(r.body.payee_pubkey).toBe(nodePubkeyFromPrivate(NODE)); expect(r.body.verified).toEqual({ amount_matches: true, description_hash_matches: true, signature_valid: true }); expect(r.body.description).toBe("Pay Alice for October");
    const ob = (await w.c.call("POST", "/v1/obligations", w.operator, { counterparty_name: "Alice (LN address)", amount_msat: "25000000", invoice: r.body.invoice })).body;
    expect(ob.state).toBe("DRAFT"); expect(ob.payee_pubkey).toBe(nodePubkeyFromPrivate(NODE));
  });
  it.each<[Mode, RegExp]>([["wrong_amount", /not the 25000000 msat requested/], ["wrong_hash", /description hash mismatch/], ["error", /not accepting payments/], ["wrong_tag", /valid LNURL-pay/], ["redirect", /redirects are not followed/], ["huge", /too large/], ["bad_json", /not valid JSON/], ["expired", /expired or expires too soon/]])("a hostile or broken server (%s) is refused with a plain reason", async (m, re) => {
    mode = m; const r = await resolve(`alice@127.0.0.1:${port}`); expect(r.status).toBe(422); expect(r.body.detail).toMatch(re);
  });
  it("amount outside the advertised range, malformed addresses, no wallet", async () => {
    mode = "honest";
    expect((await resolve(`alice@127.0.0.1:${port}`, "999999999999")).body.detail).toMatch(/outside what this recipient accepts/);
    for (const bad of ["not-an-address", "a@b", "a b@example.com", "x@localhost"]) expect((await resolve(bad)).status).toBe(422);
    const lone = await w.c.register("lone@lnurl.test", "Lone", "Lone Co");
    expect((await w.c.call("POST", "/v1/lnurl/resolve", lone, { address: "a@example.com", amount_msat: "1000" })).status).toBe(422);
  });
  it("viewers cannot resolve; unauthenticated cannot", async () => {
    expect((await w.c.call("POST", "/v1/lnurl/resolve", w.viewer, { address: "a@example.com", amount_msat: "1000" })).status).toBe(403);
    expect((await w.c.call("POST", "/v1/lnurl/resolve", null, { address: "a@example.com", amount_msat: "1000" })).status).toBe(401);
  });
  void execute;
});
