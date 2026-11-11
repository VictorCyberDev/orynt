/**
 * One WebSocket connection to one Nostr relay (NIP-01 client side). Deliberately thin: it opens, sends JSON frames,
 * delivers parsed JSON arrays and reports closure. All protocol decisions live in client.ts.
 */
import { Buffer } from "node:buffer";
import { WebSocket, type RawData } from "ws";

export interface RelaySocketOptions {
  connectTimeoutMs: number;
  maxPayloadBytes: number;
}

export type RelayMessage = unknown[];

export class RelaySocket {
  private ws: WebSocket | null = null;
  private _closed = false;
  onMessage: (msg: RelayMessage) => void = () => undefined;
  onClose: (reason: string) => void = () => undefined;

  constructor(readonly url: string, private readonly opts: RelaySocketOptions) {}

  get closed(): boolean {
    return this._closed;
  }

  /** Resolves when the WebSocket is open. Rejects (with a short, secret-free message) on any failure to connect. */
  open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.url, {
        handshakeTimeout: this.opts.connectTimeoutMs,
        maxPayload: this.opts.maxPayloadBytes,
        followRedirects: false,
        perMessageDeflate: false,
      });
      this.ws = ws;
      ws.on("open", () => {
        if (settled) return;
        settled = true;
        resolve();
      });
      ws.on("unexpected-response", (_req, res) => {
        res.resume();
        fail(`relay refused the WebSocket upgrade (HTTP ${res.statusCode ?? "?"})`);
      });
      ws.on("error", (e: NodeJS.ErrnoException) => {
        if (!settled) fail(`could not connect to relay: ${e.code ?? e.message}`);
        else this.markClosed(`socket error: ${e.code ?? e.message}`);
      });
      ws.on("message", (data: RawData, isBinary: boolean) => {
        if (isBinary || this._closed) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawToString(data));
        } catch {
          return;
        }
        if (Array.isArray(parsed)) this.onMessage(parsed);
      });
      ws.on("close", (code) => {
        if (!settled) fail(`relay closed the connection during connect (${code})`);
        else this.markClosed(`relay closed the connection (${code})`);
      });
      const fail = (msg: string) => {
        if (settled) return;
        settled = true;
        this.destroy();
        reject(new Error(msg));
      };
    });
  }

  /** Resolves once the frame has been handed to the OS; rejects if it could not be written. */
  send(msg: unknown[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = this.ws;
      if (!ws || this._closed || ws.readyState !== WebSocket.OPEN) {
        reject(Object.assign(new Error("socket not open"), { notWritten: true }));
        return;
      }
      ws.send(JSON.stringify(msg), (err) => (err ? reject(err) : resolve()));
    });
  }

  close(): void {
    this.destroy();
  }

  private markClosed(reason: string): void {
    if (this._closed) return;
    this._closed = true;
    this.onClose(reason);
  }

  private destroy(): void {
    const ws = this.ws;
    if (!this._closed) {
      this._closed = true;
    }
    this.ws = null;
    if (ws) {
      ws.removeAllListeners("message");
      ws.on("error", () => undefined);
      try {
        ws.terminate();
      } catch {
        /* already gone */
      }
    }
  }
}

function rawToString(d: RawData): string {
  if (typeof d === "string") return d;
  if (Buffer.isBuffer(d)) return d.toString("utf8");
  if (Array.isArray(d)) return Buffer.concat(d).toString("utf8");
  return Buffer.from(d).toString("utf8");
}
