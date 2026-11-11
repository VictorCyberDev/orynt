/**
 * Money handling. All amounts are integer millisatoshis held in `bigint`.
 * Floating point is never used for money. Fiat is display-only and lives elsewhere.
 */
export type Msat = bigint;

export const MSAT_PER_SAT = 1000n;
export const MSAT_PER_BTC = 100_000_000_000n;
/** 21,000,000 BTC expressed in msat — the hard upper bound of any representable amount. */
export const MAX_MSAT: Msat = 21_000_000n * MSAT_PER_BTC;

export class AmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmountError";
  }
}

/** Parse an amount from a non-negative integer (bigint, safe integer number, or digit string). */
export function toMsat(value: bigint | number | string): Msat {
  let v: bigint;
  if (typeof value === "bigint") v = value;
  else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new AmountError("amount must be a safe integer");
    v = BigInt(value);
  } else {
    if (!/^(0|[1-9][0-9]{0,30})$/.test(value))
      throw new AmountError("amount must be a canonical integer string");
    v = BigInt(value);
  }
  assertValidMsat(v);
  return v;
}

export function assertValidMsat(v: Msat): void {
  if (typeof v !== "bigint") throw new AmountError("amount must be a bigint");
  if (v < 0n) throw new AmountError("amount must not be negative");
  if (v > MAX_MSAT) throw new AmountError("amount exceeds total bitcoin supply");
}

export function satsToMsat(sats: bigint | number | string): Msat {
  return toMsat(toMsat(sats) * MSAT_PER_SAT);
}

/** Whole sats, throwing if the amount has a sub-satoshi remainder. */
export function msatToWholeSats(m: Msat): bigint {
  assertValidMsat(m);
  if (m % MSAT_PER_SAT !== 0n) throw new AmountError("amount has a sub-satoshi remainder");
  return m / MSAT_PER_SAT;
}

/** Human display, e.g. "1,250 sats" or "1,250.5 sats". Never rounds. */
export function formatMsat(m: Msat): string {
  assertValidMsat(m);
  const whole = m / MSAT_PER_SAT;
  const rem = m % MSAT_PER_SAT;
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (rem === 0n) return `${w} ${whole === 1n ? "sat" : "sats"}`;
  const frac = rem.toString().padStart(3, "0").replace(/0+$/, "");
  return `${w}.${frac} sats`;
}

/** Parse a user-entered sats value ("12500" or "12500.5") into msat without floats. */
export function parseSatsInput(input: string): Msat {
  const s = input.trim().replace(/,/g, "");
  const m = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,3}))?$/.exec(s);
  if (!m) throw new AmountError("enter a number of sats, e.g. 25000");
  const whole = BigInt(m[1] as string);
  const frac = BigInt(((m[2] ?? "") + "000").slice(0, 3));
  return toMsat(whole * MSAT_PER_SAT + frac);
}
