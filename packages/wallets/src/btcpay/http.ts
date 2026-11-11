import { Buffer } from "node:buffer";
import { NotSentError, OutcomeUnknownError } from "../types";
import { redactSecrets } from "./redact";

/** Transport-level errors that prove no request bytes reached BTCPay (DNS, refused connection, TLS handshake rejected). */
const NOT_SENT_CODES = new Set([
  "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ERR_INVALID_URL",
  "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "ERR_TLS_CERT_ALTNAME_INVALID", "ERR_SSL_WRONG_VERSION_NUMBER",
]);

const MAX_BODY_BYTES = 256 * 1024;

/** A Greenfield error body: `{code, message}` (ProblemDetails), `{code:"missing-permission", message, missingPermission}`, or a validation array. */
export interface BtcpayResponse {
  status: number;
  /** Parsed JSON body, or undefined when empty or not JSON. */
  json: unknown;
  nonJsonBody: boolean;
  /** Greenfield `code` of an error body. */
  code?: string;
  message?: string;
  missingPermission?: string;
  validation?: Array<{ path: string; message: string }>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function describe(res: BtcpayResponse): BtcpayResponse {
  const j = res.json;
  if (isRecord(j)) {
    if (typeof j["code"] === "string") res.code = j["code"];
    if (typeof j["message"] === "string") res.message = j["message"];
    if (typeof j["missingPermission"] === "string") res.missingPermission = j["missingPermission"];
  } else if (Array.isArray(j) && j.every((e) => isRecord(e) && typeof e["path"] === "string" && typeof e["message"] === "string")) {
    res.validation = j.map((e) => ({ path: String((e as Record<string, unknown>)["path"]), message: String((e as Record<string, unknown>)["message"]) }));
  }
  return res;
}

function errorCode(e: unknown): string | undefined {
  const x = e as { code?: unknown; cause?: { code?: unknown } } | null;
  const c = x?.cause?.code ?? x?.code;
  return typeof c === "string" ? c : undefined;
}

/**
 * Minimal fetch wrapper. It guarantees:
 *  - the API key only ever appears in the Authorization header (and is stripped from every message that leaves here);
 *  - redirects are never followed (a redirect would replay the Authorization header to another origin);
 *  - every request has a hard deadline covering headers AND body; a deadline is OutcomeUnknownError, never "failed";
 *  - transport errors are split into "provably not sent" (NotSentError) and "may have been sent" (OutcomeUnknownError).
 */
export class BtcpayHttp {
  readonly #apiKey: string;
  constructor(
    private readonly baseUrl: string,
    apiKey: string,
    private readonly fetchImpl: typeof fetch,
  ) {
    this.#apiKey = apiKey;
  }

  redact(text: string): string {
    return redactSecrets(text, [this.#apiKey]);
  }

  async request(method: "GET" | "POST", path: string, opts: { body?: unknown; timeoutMs: number }): Promise<BtcpayResponse> {
    const url = `${this.baseUrl}${path}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
    const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    try {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          redirect: "manual",
          signal: ac.signal,
          headers: {
            authorization: `token ${this.#apiKey}`,
            accept: "application/json",
            ...(payload === undefined ? {} : { "content-type": "application/json" }),
          },
          ...(payload === undefined ? {} : { body: payload }),
        });
      } catch (e) {
        throw this.transportError(e, ac.signal.aborted, opts.timeoutMs);
      }
      let text: string;
      try {
        text = await this.readCapped(res, ac.signal);
      } catch (e) {
        if (e instanceof OutcomeUnknownError) throw e;
        throw new OutcomeUnknownError(`response from BTCPay was cut off: ${this.redact(e instanceof Error ? e.message : String(e))}`);
      }
      let json: unknown;
      let nonJsonBody = false;
      if (text.trim().length > 0) {
        try {
          json = JSON.parse(text);
        } catch {
          nonJsonBody = true;
        }
      }
      return describe({ status: res.status, json, nonJsonBody });
    } finally {
      clearTimeout(timer);
    }
  }

  private async readCapped(res: Response, signal: AbortSignal): Promise<string> {
    if (!res.body) return "";
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    const onAbort = () => void reader.cancel().catch(() => undefined);
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new OutcomeUnknownError("BTCPay response exceeded the size limit");
        }
        chunks.push(value);
      }
    } catch (e) {
      if (signal.aborted) throw new OutcomeUnknownError("timed out while reading the BTCPay response");
      throw e;
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }

  private transportError(e: unknown, aborted: boolean, timeoutMs: number): Error {
    if (aborted) return new OutcomeUnknownError(`no answer from BTCPay within ${timeoutMs}ms`);
    const code = errorCode(e);
    const cause = new Error(this.redact(e instanceof Error ? e.message : String(e)));
    if (code && NOT_SENT_CODES.has(code)) return new NotSentError(`could not reach BTCPay: ${code}`, cause);
    return new OutcomeUnknownError(`transport error talking to BTCPay: ${code ?? this.redact(e instanceof Error ? e.message : String(e))}`, cause);
  }
}

export { isRecord };
