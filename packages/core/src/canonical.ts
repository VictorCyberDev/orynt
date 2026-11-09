/**
 * Canonical JSON (a strict subset of RFC 8785 / JCS):
 *  - object keys sorted by UTF-16 code units, no insignificant whitespace
 *  - numbers must be safe integers (no floats, NaN, Infinity) — money is always a decimal *string*
 *  - bigint is rejected on purpose: serialise amounts explicitly as strings
 *  - undefined object members are rejected (be explicit with null)
 * Evidence hashing depends on this being byte-for-byte stable.
 */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export class CanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalError";
  }
}

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isSafeInteger(value)) throw new CanonicalError("only safe integers are allowed in canonical JSON");
      return String(value);
    case "bigint":
      throw new CanonicalError("bigint must be serialised as a string");
    case "undefined":
      throw new CanonicalError("undefined is not allowed in canonical JSON");
    case "object": {
      if (Array.isArray(value)) return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) throw new CanonicalError("only plain objects are allowed");
      const keys = Object.keys(value as object).sort();
      return (
        "{" +
        keys.map((k) => JSON.stringify(k) + ":" + canonicalize((value as Record<string, unknown>)[k])).join(",") +
        "}"
      );
    }
    default:
      throw new CanonicalError(`unsupported type ${typeof value}`);
  }
}
