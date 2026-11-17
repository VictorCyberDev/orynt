/**
 * In-process Nostr relay for CONTRACT TESTS ONLY (NIP-01: EVENT / REQ / CLOSE in, EVENT / OK / EOSE / CLOSED / NOTICE out).
 * It verifies event ids and BIP-340 signatures, stores regular + replaceable events, treats ephemeral kinds as non-stored,
 * and implements the NIP-01 filter semantics (ids, authors, kinds, #tags, since, until, limit). Listens on loopback only.
 * It can be scripted to misbehave the way real relays do (drop connections, reject events, refuse subscriptions, go mute).
 *
 * This is NOT a real relay and proves nothing about any real relay's behaviour.
 */
import { WebSocketServer, WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import { parseEventShape, verifyEventSignature, type NostrEvent } from "../../src/nwc/nostr";

interface Filter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [tag: string]: unknown;
}
interface Sub {
  ws: WebSocket;
  id: string;
  filters: Filter[];
}

export function matches(f: Filter, e: NostrEvent): boolean {
  if (f.ids && !f.ids.includes(e.id)) return false;
  if (f.authors && !f.authors.includes(e.pubkey)) return false;
  if (f.kinds && !f.kinds.includes(e.kind)) return false;
  if (f.since !== undefined && e.created_at < f.since) return false;
  if (f.until !== undefined && e.created_at > f.until) return false;
  for (const [k, v] of Object.entries(f)) {
    if (!k.startsWith("#") || !Array.isArray(v)) continue;
    const name = k.slice(1);
    if (!e.tags.some((t) => t[0] === name && v.includes(t[1]))) return false;
  }
  return true;
}

const isReplaceable = (k: number) => k === 0 || k === 3 || (k >= 10000 && k < 20000);
const isEphemeral = (k: number) => k >= 20000 && k < 30000;

export class FakeRelay {
  private wss!: WebSocketServer;
  private readonly sockets = new Set<WebSocket>();
  private readonly subs: Sub[] = [];
  private readonly stored = new Map<string, NostrEvent>();
  /** every EVENT frame received, in order (for assertions) */
  readonly received: NostrEvent[] = [];
  /** reply to the next EVENT(s) matching `kind` with OK false and this message instead of accepting */
  rejectEvents: { kind?: number; message: string } | null = null;
  /** accept events (store + broadcast) but never send OK */
  muteOk = false;
  /** answer every REQ with CLOSED instead of EOSE */
  refuseSubscriptions: string | null = null;
  /** delay EOSE by this many ms */
  eoseDelayMs = 0;
  /** accept the TCP/WebSocket connection but never answer REQ */
  blackhole = false;
  /** real relays verify event ids and signatures (NIP-01); a hostile or buggy one may not. Default true. */
  verifyEvents = true;
  /** a hostile/buggy relay: ignore subscription filters and deliver every event to every subscription */
  lax = false;
  /** events a hostile relay appends to EVERY REQ answer (forged / replayed material), bypassing storage and filters */
  hostileExtras: NostrEvent[] = [];
  /** ordered log of client frames: connection number, frame type and (for EVENT) the kind */
  readonly frameLog: Array<{ conn: number; type: string; kind?: number }> = [];
  private connSeq = 0;
  private readonly connNo = new WeakMap<WebSocket, number>();
  /** terminate the socket as soon as an EVENT of this kind is received (before OK / broadcast) */
  dropOnEventKind: number | null = null;

  async start(): Promise<string> {
    this.wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await new Promise<void>((res) => this.wss.once("listening", () => res()));
    this.wss.on("connection", (ws) => {
      this.sockets.add(ws);
      this.connNo.set(ws, ++this.connSeq);
      ws.on("close", () => {
        this.sockets.delete(ws);
        for (let i = this.subs.length - 1; i >= 0; i--) if (this.subs[i]?.ws === ws) this.subs.splice(i, 1);
      });
      ws.on("error", () => undefined);
      ws.on("message", (data) => this.onFrame(ws, data.toString()));
    });
    return this.url;
  }
  get url(): string {
    return `ws://127.0.0.1:${(this.wss.address() as AddressInfo).port}`;
  }
  get connectionCount(): number {
    return this.sockets.size;
  }
  async stop(): Promise<void> {
    for (const s of this.sockets) s.terminate();
    await new Promise<void>((res) => this.wss.close(() => res()));
  }
  /** Kill every client connection abruptly (TCP reset-ish), like a relay restart or a network cut. */
  dropAllConnections(): void {
    for (const s of this.sockets) s.terminate();
  }

  private send(ws: WebSocket, msg: unknown[]) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  private onFrame(ws: WebSocket, raw: string) {
    let m: unknown;
    try {
      m = JSON.parse(raw);
    } catch {
      return this.send(ws, ["NOTICE", "error: invalid JSON"]);
    }
    if (!Array.isArray(m)) return this.send(ws, ["NOTICE", "error: expected array"]);
    this.frameLog.push({
      conn: this.connNo.get(ws) ?? 0,
      type: String(m[0]),
      kind: m[0] === "EVENT" ? (m[1] as { kind?: number } | undefined)?.kind : undefined,
    });
    if (m[0] === "EVENT") return this.onEvent(ws, m[1]);
    if (m[0] === "REQ" && typeof m[1] === "string") return this.onReq(ws, m[1], m.slice(2) as Filter[]);
    if (m[0] === "CLOSE" && typeof m[1] === "string") {
      const i = this.subs.findIndex((s) => s.ws === ws && s.id === m[1]);
      if (i >= 0) this.subs.splice(i, 1);
      return;
    }
    this.send(ws, ["NOTICE", "error: unknown message type"]);
  }

  private onEvent(ws: WebSocket, raw: unknown) {
    const ev = parseEventShape(raw);
    const idGuess = typeof (raw as { id?: unknown })?.id === "string" ? (raw as { id: string }).id : "";
    if (!ev) return this.send(ws, ["OK", idGuess, false, "invalid: malformed event"]);
    if (this.dropOnEventKind === ev.kind) {
      ws.terminate();
      return;
    }
    this.received.push(ev);
    if (this.verifyEvents && !verifyEventSignature(ev))
      return this.send(ws, ["OK", ev.id, false, "invalid: bad signature or id"]);
    if (this.rejectEvents && (this.rejectEvents.kind === undefined || this.rejectEvents.kind === ev.kind)) {
      return this.send(ws, ["OK", ev.id, false, this.rejectEvents.message]);
    }
    if (!isEphemeral(ev.kind)) {
      if (isReplaceable(ev.kind)) {
        for (const [id, old] of this.stored) {
          if (old.pubkey === ev.pubkey && old.kind === ev.kind) {
            if (old.created_at > ev.created_at || (old.created_at === ev.created_at && old.id < ev.id))
              return this.send(ws, ["OK", ev.id, true, "duplicate: have a newer version"]);
            this.stored.delete(id);
          }
        }
      }
      this.stored.set(ev.id, ev);
    }
    if (!this.muteOk) this.send(ws, ["OK", ev.id, true, ""]);
    for (const s of this.subs) {
      if (this.lax || s.filters.some((f) => matches(f, ev))) this.send(s.ws, ["EVENT", s.id, ev]);
    }
  }

  private onReq(ws: WebSocket, id: string, filters: Filter[]) {
    if (this.blackhole) return;
    if (this.refuseSubscriptions) return this.send(ws, ["CLOSED", id, this.refuseSubscriptions]);
    const sub: Sub = { ws, id, filters };
    this.subs.push(sub);
    for (const f of filters) {
      let hits = [...this.stored.values()]
        .filter((e) => this.lax || matches(f, e))
        .sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1));
      if (f.limit !== undefined) hits = hits.slice(0, f.limit);
      for (const e of hits) this.send(ws, ["EVENT", id, e]);
    }
    for (const e of this.hostileExtras) this.send(ws, ["EVENT", id, e]);
    const eose = () => this.send(ws, ["EOSE", id]);
    if (this.eoseDelayMs > 0) setTimeout(eose, this.eoseDelayMs);
    else eose();
  }

  /** Inject an event as if some client had published it (stored/broadcast subject to the normal rules). */
  inject(ev: NostrEvent): void {
    if (!isEphemeral(ev.kind)) {
      if (isReplaceable(ev.kind))
        for (const [id, old] of this.stored)
          if (old.pubkey === ev.pubkey && old.kind === ev.kind) this.stored.delete(id);
      this.stored.set(ev.id, ev);
    }
    for (const s of this.subs)
      if (this.lax || s.filters.some((f) => matches(f, ev))) this.send(s.ws, ["EVENT", s.id, ev]);
  }
  storedEvents(): NostrEvent[] {
    return [...this.stored.values()];
  }
}
