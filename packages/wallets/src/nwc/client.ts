/**
 * NIP-47 client: info-event retrieval and the request/response exchange over one or more relays.
 *
 * Safety properties (each is covered by a contract test against the local fake in test/):
 *  - The response subscription is established (EOSE) BEFORE the request is published, so a fast wallet cannot be missed.
 *  - Only a response that is structurally valid, signed by the wallet service key (BIP-340), addressed to us (`p`),
 *    answering THIS request (`e`), not expired, not stale and decryptable is accepted. Everything else is dropped
 *    (and reported through `onDiagnostic`) — a forged or replayed response can never decide an outcome.
 *  - "Not sent" is claimed only when nothing was written to any relay, or every relay we wrote to answered `OK false`
 *    with a prefix that means the relay did not accept the event. A timeout, a dropped connection or an `OK true`
 *    followed by silence is NEVER "not sent".
 */
import { randomBytes, bytesToHex } from "@noble/hashes/utils.js";
import { decryptPayload, encryptPayload, type EncryptionScheme } from "./encryption";
import { NwcNotSentError, NwcRelayUnavailableError } from "./errors";
import { KIND_INFO, KIND_REQUEST, KIND_RESPONSE, isExpired, parseEventShape, signEvent, tagValues, verifyEventSignature, type NostrEvent } from "./nostr";
import { RelaySocket, relayLabel } from "./relay";
import { unsafeRevealSecret, type RedactedSecret } from "./secret";
import { OutcomeUnknownError } from "../types";

export type ResponseRejection =
  | "malformed" | "wrong_kind" | "wrong_author" | "wrong_p_tag" | "wrong_e_tag" | "expired" | "stale"
  | "bad_signature" | "undecryptable" | "malformed_payload" | "wrong_result_type";

export type NwcDiagnostic =
  | { type: "response_rejected"; reason: ResponseRejection; relay: string }
  | { type: "info_rejected"; reason: string; relay: string }
  | { type: "relay_failed"; relay: string; reason: string }
  | { type: "publish_ack"; relay: string; accepted: boolean; message: string }
  | { type: "fee_limit_exceeded"; feeMsat: string; limitMsat: string }
  | { type: "preimage_mismatch"; where: "pay_invoice" | "lookup_invoice" };

export interface NwcInfo {
  eventId: string;
  createdAt: number;
  /** methods advertised in the info event content (space separated) */
  methods: ReadonlySet<string>;
  /** schemes from the `encryption` tag; null when the tag is absent (=> nip04 only per NIP-47) */
  encryption: readonly string[] | null;
  extensions: readonly string[];
}

export interface NwcResponse {
  error: { code: string; message: string } | null;
  result: Record<string, unknown> | null;
}

export interface NwcClientOptions {
  walletPubkey: string;
  clientPubkey: string;
  relays: string[];
  secret: RedactedSecret;
  connectTimeoutMs: number;
  infoTimeoutMs: number;
  maxPayloadBytes: number;
  /** a response whose created_at is older than (request.created_at - this) is treated as a replay */
  maxResponseSkewSeconds: number;
  /** after the first relay is ready, wait at most this long for the others before publishing */
  relayGraceMs: number;
  nowSeconds: () => number;
  onDiagnostic: (d: NwcDiagnostic) => void;
}

/** OK-false prefixes (NIP-01) that mean the relay did NOT accept/forward the event. Anything else is ambiguous. */
const DEFINITIVE_REJECT_PREFIXES = ["blocked", "invalid", "restricted", "rate-limited", "pow", "auth-required"];

interface RelayState {
  sock: RelaySocket;
  ready: boolean;
  settled: boolean;
  written: boolean;
  ack: "none" | "accepted" | "rejected_definitive" | "rejected_other";
}

interface Op {
  abort(): void;
}

export class NwcClient {
  private closed = false;
  private readonly ops = new Set<Op>();

  constructor(private readonly o: NwcClientOptions) {}

  get isClosed(): boolean {
    return this.closed;
  }

  /** Abort everything in flight and refuse further work. Does not touch the secret (the owner of the secret destroys it). */
  close(): void {
    this.closed = true;
    for (const op of [...this.ops]) op.abort();
    this.ops.clear();
  }

  private sockets(): RelaySocket[] {
    return this.o.relays.map((url) => new RelaySocket(url, { connectTimeoutMs: this.o.connectTimeoutMs, maxPayloadBytes: this.o.maxPayloadBytes }));
  }

  // ---- info event (kind 13194) ----------------------------------------------------------------------------------
  /**
   * Returns the newest valid info event, or null if the relays answered but hold none.
   * Throws NwcRelayUnavailableError if no relay could be reached / none answered in time.
   */
  async fetchInfo(): Promise<NwcInfo | null> {
    if (this.closed) throw new NwcRelayUnavailableError("adapter closed");
    const subId = `nwc-info-${bytesToHex(randomBytes(8))}`;
    const socks = this.sockets();
    let best: NostrEvent | null = null;
    let connected = 0;
    let eose = 0;
    let aborted = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wake: () => void = () => undefined;
    const op: Op = { abort: () => { aborted = true; wake(); } };
    this.ops.add(op);

    const consider = (relay: string, raw: unknown) => {
      const ev = parseEventShape(raw);
      const rej = (reason: string) => this.o.onDiagnostic({ type: "info_rejected", reason, relay });
      if (!ev) return rej("malformed");
      if (ev.kind !== KIND_INFO) return rej("wrong_kind");
      if (ev.pubkey !== this.o.walletPubkey) return rej("wrong_author");
      if (isExpired(ev, this.o.nowSeconds())) return rej("expired");
      if (!verifyEventSignature(ev)) return rej("bad_signature");
      if (!best || ev.created_at > best.created_at || (ev.created_at === best.created_at && ev.id < best.id)) best = ev;
    };

    try {
      await new Promise<void>((resolve) => {
        wake = resolve;
        let pending = socks.length;
        timer = setTimeout(resolve, this.o.infoTimeoutMs);
        for (const s of socks) {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            if (--pending === 0) resolve();
          };
          s.onMessage = (m) => {
            if (m[1] !== subId) return;
            if (m[0] === "EVENT") consider(relayLabel(s.url), m[2]);
            else if (m[0] === "EOSE") { eose++; finish(); }
            else if (m[0] === "CLOSED") { this.o.onDiagnostic({ type: "relay_failed", relay: relayLabel(s.url), reason: "subscription closed by relay" }); finish(); }
          };
          s.onClose = () => finish();
          s.open().then(() => { connected++; return s.send(["REQ", subId, { kinds: [KIND_INFO], authors: [this.o.walletPubkey], limit: 1 }]); })
            .catch((e: Error) => { this.o.onDiagnostic({ type: "relay_failed", relay: relayLabel(s.url), reason: e.message }); finish(); });
        }
      });
    } finally {
      if (timer) clearTimeout(timer);
      this.ops.delete(op);
      for (const s of socks) s.close();
    }
    if (aborted) throw new NwcRelayUnavailableError("adapter closed");
    if (best) return parseInfo(best);
    if (connected === 0) throw new NwcRelayUnavailableError("no relay could be reached");
    if (eose === 0) throw new NwcRelayUnavailableError("relays connected but did not answer the info request");
    return null;
  }

  // ---- request / response ----------------------------------------------------------------------------------------
  async call(method: string, params: Record<string, unknown>, o: { scheme: EncryptionScheme; timeoutMs: number; expireAfterSeconds?: number }): Promise<NwcResponse> {
    if (this.closed) throw new NwcNotSentError("adapter is closed", "adapter_closed");

    // 1. build + sign the request (nothing is on the wire yet; any failure here is a provable "not sent")
    const createdAt = this.o.nowSeconds();
    let request: NostrEvent;
    try {
      const tags: string[][] = [["encryption", o.scheme], ["p", this.o.walletPubkey]];
      if (o.expireAfterSeconds !== undefined) tags.push(["expiration", String(createdAt + Math.max(1, Math.ceil(o.expireAfterSeconds)))]);
      const sk = unsafeRevealSecret(this.o.secret);
      const content = encryptPayload(o.scheme, JSON.stringify({ method, params }), sk, this.o.walletPubkey);
      request = signEvent({ pubkey: this.o.clientPubkey, created_at: createdAt, kind: KIND_REQUEST, tags, content }, sk);
    } catch (e) {
      throw new NwcNotSentError(`could not build the request: ${(e as Error).message}`, this.closed ? "adapter_closed" : "invalid_request");
    }

    const subId = `nwc-${bytesToHex(randomBytes(8))}`;
    const filter = { kinds: [KIND_RESPONSE], authors: [this.o.walletPubkey], "#e": [request.id], "#p": [this.o.clientPubkey] };
    const states: RelayState[] = this.sockets().map((sock) => ({ sock, ready: false, settled: false, written: false, ack: "none" }));
    const seen = new Set<string>();
    let published = false;
    let finished = false;
    let resolveFn!: (r: NwcResponse) => void;
    let rejectFn!: (e: Error) => void;
    const outcome = new Promise<NwcResponse>((res, rej) => { resolveFn = res; rejectFn = rej; });
    outcome.catch(() => undefined); // an early rejection must never surface as an unhandled rejection; callers await `outcome` below
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    let phaseWake: () => void = () => undefined;
    let graceStarted = false;

    const finish = (err: Error | null, res?: NwcResponse) => {
      if (finished) return;
      finished = true;
      if (err) rejectFn(err); else resolveFn(res as NwcResponse);
    };
    const abort: Op = {
      abort: () => {
        if (published) finish(new OutcomeUnknownError("adapter closed while waiting for the wallet's response"));
        else finish(new NwcNotSentError("adapter closed before the request was published", "adapter_closed"));
        phaseWake();
      },
    };
    this.ops.add(abort);

    const evaluate = () => {
      if (!published || finished) return;
      const written = states.filter((s) => s.written);
      if (written.length === 0) return;
      if (written.every((s) => s.ack === "rejected_definitive")) {
        finish(new NwcNotSentError("every relay refused the request event", "relay_rejected"));
      } else if (written.every((s) => s.sock.closed)) {
        finish(new OutcomeUnknownError("all relay connections were lost after the request was published; the wallet may or may not have executed it"));
      }
    };

    const handleResponse = (relay: string, raw: unknown) => {
      const rej = (reason: ResponseRejection) => this.o.onDiagnostic({ type: "response_rejected", reason, relay });
      const ev = parseEventShape(raw);
      if (!ev) return rej("malformed");
      if (seen.has(ev.id)) return; // same accepted event echoed by another relay
      if (ev.kind !== KIND_RESPONSE) return rej("wrong_kind");
      if (ev.pubkey !== this.o.walletPubkey) return rej("wrong_author");
      if (tagValues(ev, "p")[0] !== this.o.clientPubkey) return rej("wrong_p_tag");
      if (tagValues(ev, "e")[0] !== request.id) return rej("wrong_e_tag");
      if (isExpired(ev, this.o.nowSeconds())) return rej("expired");
      if (ev.created_at < createdAt - this.o.maxResponseSkewSeconds) return rej("stale");
      if (!verifyEventSignature(ev)) return rej("bad_signature"); // BEFORE decrypting (NIP-44)
      let parsed: unknown;
      try {
        parsed = JSON.parse(decryptPayload(o.scheme, ev.content, unsafeRevealSecret(this.o.secret), this.o.walletPubkey));
      } catch (e) {
        return rej(e instanceof SyntaxError ? "malformed_payload" : "undecryptable");
      }
      const payload = validateResponsePayload(parsed);
      if (!payload) return rej("malformed_payload");
      if (payload.resultType !== method) return rej("wrong_result_type");
      seen.add(ev.id);
      finish(null, { error: payload.error, result: payload.result });
    };

    const cleanup = () => {
      for (const t of timers) clearTimeout(t);
      this.ops.delete(abort);
      for (const s of states) {
        if (!s.sock.closed) void s.sock.send(["CLOSE", subId]).catch(() => undefined);
        s.sock.close();
      }
    };

    try {
      // 2. connect to every relay and subscribe for the response BEFORE publishing
      const allSettled = new Promise<void>((resolve) => { phaseWake = resolve; });
      const checkPhase = () => {
        if (states.every((s) => s.settled)) phaseWake();
        else if (!graceStarted && states.some((s) => s.ready)) {
          graceStarted = true;
          timers.push(setTimeout(phaseWake, this.o.relayGraceMs));
        }
      };
      timers.push(setTimeout(phaseWake, this.o.connectTimeoutMs));
      for (const st of states) {
        const s = st.sock;
        s.onMessage = (m) => {
          if (m[0] === "EVENT" && m[1] === subId) handleResponse(relayLabel(s.url), m[2]);
          else if (m[0] === "EOSE" && m[1] === subId) { st.ready = true; st.settled = true; checkPhase(); }
          else if (m[0] === "CLOSED" && m[1] === subId) { this.o.onDiagnostic({ type: "relay_failed", relay: relayLabel(s.url), reason: "subscription closed by relay" }); st.ready = false; st.settled = true; checkPhase(); }
          else if (m[0] === "OK" && m[1] === request.id) {
            const accepted = m[2] === true;
            const message = typeof m[3] === "string" ? m[3].slice(0, 200) : "";
            this.o.onDiagnostic({ type: "publish_ack", relay: relayLabel(s.url), accepted, message });
            if (accepted) st.ack = "accepted";
            else st.ack = DEFINITIVE_REJECT_PREFIXES.some((p) => message.startsWith(`${p}:`)) ? "rejected_definitive" : "rejected_other";
            evaluate();
          }
        };
        s.onClose = (why) => {
          this.o.onDiagnostic({ type: "relay_failed", relay: relayLabel(s.url), reason: why });
          st.ready = false;
          st.settled = true;
          if (!published) checkPhase(); else evaluate();
        };
        s.open()
          .then(() => s.send(["REQ", subId, filter]))
          .catch((e: Error) => {
            this.o.onDiagnostic({ type: "relay_failed", relay: relayLabel(s.url), reason: e.message });
            st.settled = true;
            checkPhase();
          });
      }
      await allSettled;
      if (finished) return await outcome; // aborted while connecting

      const ready = states.filter((s) => s.ready && !s.sock.closed);
      if (ready.length === 0) throw new NwcNotSentError("could not subscribe to a relay for the response; nothing was published", "relay_unreachable");

      // 3. publish. From the first byte written, "not sent" can no longer be assumed.
      published = true;
      const deadline = setTimeout(() => finish(new OutcomeUnknownError(`no authentic response from the wallet service within ${o.timeoutMs}ms; the request may or may not have been executed`)), o.timeoutMs);
      timers.push(deadline);
      let anyWritten = false;
      await Promise.all(ready.map(async (st) => {
        try {
          await st.sock.send(["EVENT", request]);
          st.written = true;
          anyWritten = true;
        } catch (e) {
          // A frame that was never handed to the socket is provably not sent on that relay; any other write error is ambiguous.
          if (!(e as { notWritten?: boolean }).notWritten) st.written = true;
          if (st.written) anyWritten = true;
        }
      }));
      if (!anyWritten) {
        published = false;
        throw new NwcNotSentError("the request could not be written to any relay", "relay_unreachable");
      }
      evaluate();
      return await outcome;
    } finally {
      cleanup();
    }
  }
}

// ---- parsing helpers ---------------------------------------------------------------------------------------------
export function parseInfo(ev: NostrEvent): NwcInfo {
  const methods = new Set(ev.content.split(/\s+/).filter((m) => /^[a-z0-9_]{1,64}$/.test(m)).slice(0, 128));
  const enc = tagValues(ev, "encryption")[0];
  const encryption = enc === undefined ? null : enc.split(/\s+/).filter((x) => x.length > 0 && x.length <= 32);
  const ext = tagValues(ev, "extensions")[0];
  return { eventId: ev.id, createdAt: ev.created_at, methods, encryption: encryption && encryption.length > 0 ? encryption : null, extensions: ext ? ext.split(/\s+/).filter(Boolean).slice(0, 64) : [] };
}

function validateResponsePayload(v: unknown): { resultType: string; error: { code: string; message: string } | null; result: Record<string, unknown> | null } | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o["result_type"] !== "string") return null;
  const err = o["error"];
  const res = o["result"];
  if (err !== undefined && err !== null) {
    if (typeof err !== "object" || Array.isArray(err)) return null;
    const e = err as Record<string, unknown>;
    if (typeof e["code"] !== "string" || e["code"].length === 0 || e["code"].length > 64) return null;
    return { resultType: o["result_type"], error: { code: e["code"], message: typeof e["message"] === "string" ? e["message"] : "" }, result: null };
  }
  if (typeof res !== "object" || res === null || Array.isArray(res)) return null;
  return { resultType: o["result_type"], error: null, result: res as Record<string, unknown> };
}
