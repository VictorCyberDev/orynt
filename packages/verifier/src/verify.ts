import {
  GENESIS_HASH,
  ReceiptSchema,
  decodeInvoice,
  hexToBytes,
  sha256Hex,
  intentDigest,
  revisionHash,
  verifyApproval,
  verifyChainSegment,
  verifyCheckpoint,
  verifyReceiptAttestation,
  timingSafeEqualStr,
  type Receipt,
  type AuditEntry,
} from "@orynt/core";

export type CheckStatus = "PASS" | "FAIL" | "WARN" | "SKIP";
export interface Check {
  id: string;
  status: CheckStatus;
  detail: string;
}
export type Verdict =
  | "VERIFIED" // all checks pass, issuer trusted, real provider
  | "VERIFIED_SIMULATED" // all checks pass but the payment was produced by the labelled simulator — NOT a real payment
  | "INTEGRITY_ONLY" // internally consistent and payment proof valid, but the issuer key is not a trust root you supplied
  | "REJECTED";

export interface TrustedKey {
  key_id: string;
  public_key: string;
  valid_from?: string;
  valid_until?: string;
}
export interface VerifyOptions {
  trustedKeys?: TrustedKey[];
  requireReal?: boolean;
  expect?: {
    paymentHash?: string;
    amountMsat?: string;
    payeePubkey?: string;
    network?: string;
    obligationId?: string;
  };
  maxAgeSeconds?: number;
  now?: Date;
  clockSkewSeconds?: number;
  seenReceiptIds?: ReadonlySet<string>;
}
export interface Report {
  verdict: Verdict;
  checks: Check[];
  summary?: {
    receiptId: string;
    network: string;
    environment: string;
    amountMsat: string;
    paymentHash: string;
    payeePubkey: string;
    settledAt: string;
    approvers: string[];
    issuerKeyId: string;
  };
  cannotProve: string[];
}

const ts = (s: string) => Date.parse(s);

export function verifyReceipt(input: unknown, opts: VerifyOptions = {}): Report {
  const checks: Check[] = [];
  const add = (id: string, ok: boolean | "warn" | "skip", detail: string) =>
    checks.push({
      id,
      status: ok === true ? "PASS" : ok === "warn" ? "WARN" : ok === "skip" ? "SKIP" : "FAIL",
      detail,
    });
  const finish = (r: Receipt | null): Report => {
    const failed = checks.some((c) => c.status === "FAIL");
    let verdict: Verdict;
    if (failed || !r) verdict = "REJECTED";
    else if (r.environment === "SIMULATOR") verdict = "VERIFIED_SIMULATED";
    else if (checks.find((c) => c.id === "issuer.trusted")?.status === "PASS") verdict = "VERIFIED";
    else verdict = "INTEGRITY_ONLY";
    return {
      verdict,
      checks,
      summary: r
        ? {
            receiptId: r.receipt_id,
            network: r.network,
            environment: r.environment,
            amountMsat: r.agreement.amount_msat,
            paymentHash: r.agreement.payment_hash,
            payeePubkey: r.agreement.payee_pubkey,
            settledAt: r.settlement.settled_at,
            approvers: r.approvals.map((a) => a.approver.name),
            issuerKeyId: r.issuer.key_id,
          }
        : undefined,
      cannotProve: r ? r.limitations : [],
    };
  };

  // 1. schema ------------------------------------------------------------------------------------
  const parsed = ReceiptSchema.safeParse(input);
  if (!parsed.success) {
    add(
      "schema",
      false,
      parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    );
    return finish(null);
  }
  const r = parsed.data;
  add("schema", true, `valid ${r.schema}`);
  const now = (opts.now ?? new Date()).getTime();
  const skew = (opts.clockSkewSeconds ?? 300) * 1000;

  // 2. attestation + issuer trust -----------------------------------------------------------------
  add("attestation.signature", verifyReceiptAttestation(r), "issuer signature over the receipt body");
  if (r.attestation.key_id !== r.issuer.key_id)
    add("attestation.key_id", false, "attestation key_id differs from issuer key_id");
  const trusted = opts.trustedKeys?.find((k) => timingSafeEqualStr(k.public_key, r.issuer.public_key));
  if (!opts.trustedKeys || opts.trustedKeys.length === 0) {
    add(
      "issuer.trusted",
      "warn",
      "no trust root supplied: the issuer key is self-asserted. Pass --trust-key to anchor it.",
    );
  } else if (!trusted) {
    add(
      "issuer.trusted",
      false,
      "issuer key is not in the supplied trust roots (forged or from an unknown issuer)",
    );
  } else {
    const issued = ts(r.issued_at);
    const okWindow =
      (!trusted.valid_from || issued >= ts(trusted.valid_from)) &&
      (!trusted.valid_until || issued <= ts(trusted.valid_until));
    add(
      "issuer.trusted",
      okWindow,
      okWindow
        ? `issuer key ${trusted.key_id} is a supplied trust root`
        : "receipt issued outside the validity window of the trusted key (key rotation/revocation)",
    );
  }

  // 3. invoice independent decode ------------------------------------------------------------------
  let inv: ReturnType<typeof decodeInvoice> | null = null;
  try {
    inv = decodeInvoice(r.agreement.invoice);
    add("invoice.signature", true, "BOLT11 signature valid; payee key recovered independently");
  } catch (e) {
    add("invoice.signature", false, (e as Error).message);
  }
  if (inv) {
    add(
      "invoice.payment_hash",
      timingSafeEqualStr(inv.paymentHash, r.agreement.payment_hash),
      "invoice payment hash equals agreement payment hash",
    );
    add(
      "invoice.payee",
      timingSafeEqualStr(inv.payeePubkey, r.agreement.payee_pubkey),
      "invoice-signing node key equals agreement payee key",
    );
    add(
      "invoice.network",
      inv.network === r.network,
      `invoice network ${inv.network} equals receipt network ${r.network}`,
    );
    add(
      "invoice.amount",
      inv.amountMsat === null || inv.amountMsat.toString() === r.agreement.amount_msat,
      inv.amountMsat === null
        ? "zero-amount invoice; amount comes from the approved agreement"
        : "invoice amount equals approved amount",
    );
    add(
      "invoice.expiry",
      inv.expiresAt === r.agreement.invoice_expires_at,
      "invoice expiry equals bound expiry",
    );
  }
  const bound = r.agreement.counterparty.bound_payee_pubkey;
  add(
    "destination.binding",
    bound === "" || bound === r.agreement.payee_pubkey,
    bound === ""
      ? "counterparty was not bound to a node key at approval time"
      : "invoice payee equals the counterparty's bound node key",
  );

  // 4. agreement + intent hashes --------------------------------------------------------------------
  const rh = revisionHash({
    obligationId: r.agreement.obligation_id,
    revision: r.agreement.revision,
    counterpartyId: r.agreement.counterparty.id,
    boundPayeePubkey: bound,
    amountMsat: BigInt(r.agreement.amount_msat),
    memo: r.agreement.memo,
    externalRef: r.agreement.external_ref,
    invoice: r.agreement.invoice,
    paymentHash: r.agreement.payment_hash,
    payeePubkey: r.agreement.payee_pubkey,
    network: r.network,
  });
  add(
    "agreement.hash",
    timingSafeEqualStr(rh, r.agreement.revision_hash),
    "revision hash recomputed from agreement fields",
  );
  const b = r.intent.binding;
  const bindingMatches =
    b.obligation_id === r.agreement.obligation_id &&
    b.revision === r.agreement.revision &&
    b.revision_hash === r.agreement.revision_hash &&
    b.amount_msat === r.agreement.amount_msat &&
    b.payment_hash === r.agreement.payment_hash &&
    b.payee_pubkey === r.agreement.payee_pubkey &&
    b.network === r.network &&
    b.invoice_expires_at === r.agreement.invoice_expires_at &&
    b.workspace_id === r.workspace.id &&
    b.policy_id === r.policy.id &&
    b.policy_revision === r.policy.revision &&
    b.policy_digest === r.policy.digest &&
    b.wallet_connection_id === r.intent.wallet_connection_id;
  add("intent.binding", bindingMatches, "intent binding fields equal the agreement, policy and workspace");
  const idg = intentDigest({
    workspaceId: b.workspace_id,
    obligationId: b.obligation_id,
    revision: b.revision,
    revisionHash: b.revision_hash,
    amountMsat: BigInt(b.amount_msat),
    network: b.network,
    paymentHash: b.payment_hash,
    payeePubkey: b.payee_pubkey,
    invoiceExpiresAt: b.invoice_expires_at,
    policyId: b.policy_id,
    policyRevision: b.policy_revision,
    policyDigest: b.policy_digest,
    walletConnectionId: b.wallet_connection_id,
  });
  add("intent.digest", timingSafeEqualStr(idg, r.intent.digest), "intent digest recomputed from binding");

  // 5. approvals ---------------------------------------------------------------------------------------
  add("attempts.present", r.attempts.length > 0, "at least one recorded execution attempt");
  const firstAttempt = r.attempts.length ? Math.min(...r.attempts.map((a) => ts(a.started_at))) : NaN;
  const seenUsers = new Set<string>();
  const seenKeys = new Set<string>();
  let validApprovals = 0;
  for (const a of r.approvals) {
    const sigOk = verifyApproval(a.public_key, a.payload, a.signature);
    const bindOk =
      a.payload.intent_digest === r.intent.digest &&
      a.payload.workspace_id === r.workspace.id &&
      a.payload.approver_user_id === a.approver.user_id;
    const dup = seenUsers.has(a.approver.user_id) || seenKeys.has(a.public_key);
    const distinctMaker =
      !r.policy.require_distinct_maker || a.approver.user_id !== r.agreement.created_by.user_id;
    const before = !Number.isNaN(firstAttempt) && ts(a.payload.signed_at) <= firstAttempt + skew; // tolerate the same clock skew the server tolerates when it accepts the signature
    const ok = sigOk && bindOk && !dup && distinctMaker && before;
    add(
      `approval.${a.approver.user_id}`,
      ok,
      ok
        ? `${a.approver.name} (${a.approver.role}) signed this exact intent before execution`
        : `invalid approval by ${a.approver.name}: ${[!sigOk && "bad signature", !bindOk && "not bound to this intent", dup && "duplicate approver", !distinctMaker && "maker approved own payment", !before && "signed after dispatch"].filter(Boolean).join(", ")}`,
    );
    seenUsers.add(a.approver.user_id);
    seenKeys.add(a.public_key);
    if (ok) validApprovals++;
  }
  add(
    "approval.threshold",
    validApprovals >= r.policy.required_approvals,
    `${validApprovals} valid approval(s), policy requires ${r.policy.required_approvals}`,
  );

  // 6. settlement = the cryptographic proof of payment ---------------------------------------------------
  const s = r.settlement;
  const preimageOk = sha256Hex(hexToBytes(s.preimage)) === r.agreement.payment_hash;
  add(
    "settlement.preimage",
    preimageOk,
    preimageOk
      ? "sha256(preimage) equals the invoice payment hash — proof that the payee's node released the preimage"
      : "preimage does not hash to the payment hash",
  );
  add(
    "settlement.amount",
    s.amount_msat === r.agreement.amount_msat,
    `settled amount ${s.amount_msat} msat vs approved ${r.agreement.amount_msat} msat`,
  );
  const real = r.environment === "REAL_PROVIDER";
  add(
    "settlement.environment",
    real
      ? r.provider.kind !== "simulator" && s.state === "SETTLED"
      : r.provider.kind === "simulator" && s.state === "SIMULATED_SETTLED",
    real
      ? "real provider with SETTLED state"
      : "SIMULATOR environment: this payment is NOT real and proves no movement of value",
  );
  if (opts.requireReal)
    add("require.real", real, real ? "real provider" : "--require-real: receipt comes from the simulator");
  if (r.network === "mainnet") add("network.note", "warn", "mainnet receipt");
  else
    add("network.note", "warn", `${r.network} is a test network: the value moved was not real-world money`);

  // 7. timeline & clock -------------------------------------------------------------------------------------
  const settledAt = ts(s.settled_at);
  const issuedAt = ts(r.issued_at);
  add(
    "time.order",
    (Number.isNaN(firstAttempt) || settledAt + skew >= firstAttempt) && issuedAt + skew >= settledAt,
    "approvals ≤ dispatch ≤ settlement ≤ issuance (within clock skew)",
  );
  add("time.not_future", issuedAt <= now + skew, "receipt is not issued in the future");
  if (opts.maxAgeSeconds !== undefined)
    add(
      "time.fresh",
      now - issuedAt <= opts.maxAgeSeconds * 1000,
      `receipt age ${Math.round((now - issuedAt) / 1000)}s vs max ${opts.maxAgeSeconds}s`,
    );

  // 8. audit chain -------------------------------------------------------------------------------------------
  const seg = r.audit.segment as AuditEntry[];
  const chain = verifyChainSegment(seg);
  add(
    "audit.chain",
    chain.ok,
    chain.ok
      ? `${seg.length} audit entries link correctly`
      : `chain broken at seq ${chain.brokenAtSeq}: ${chain.error}`,
  );
  const head = seg[seg.length - 1];
  add(
    "audit.head",
    !!head && head.hash === r.audit.checkpoint.head_hash && head.seq === r.audit.checkpoint.seq,
    "checkpoint head equals the last entry in the segment",
  );
  const expectedStream = `obligation:${r.agreement.obligation_id}`;
  add(
    "audit.binding",
    seg.length > 0 &&
      r.audit.checkpoint.stream === expectedStream &&
      r.audit.checkpoint.workspace_id === r.workspace.id &&
      seg.every((e) => e.stream === expectedStream && e.workspace_id === r.workspace.id),
    "audit segment and checkpoint belong to this obligation and workspace",
  );
  add(
    "audit.genesis",
    seg.length > 0 && seg[0]!.seq === 1 && seg[0]!.prev_hash === GENESIS_HASH,
    "segment starts at the beginning of the obligation's history (no truncated head)",
  );
  add(
    "audit.checkpoint_signature",
    verifyCheckpoint(r.issuer.public_key, r.audit.checkpoint, r.audit.checkpoint_signature),
    "checkpoint signed by the issuer key",
  );
  const settledEntry = seg.find(
    (e) =>
      e.type === "payment.settled" &&
      e.subject === `obligation:${r.agreement.obligation_id}` &&
      (e.data as { payment_hash?: string }).payment_hash === r.agreement.payment_hash,
  );
  add("audit.contains_settlement", !!settledEntry, "audit segment records this settlement");

  // 9. claimant expectations & replay -----------------------------------------------------------------------
  const x = opts.expect;
  if (x) {
    if (x.paymentHash !== undefined)
      add(
        "expect.payment_hash",
        x.paymentHash === r.agreement.payment_hash,
        "receipt is for the payment hash you expect (replay of another receipt is rejected)",
      );
    if (x.amountMsat !== undefined)
      add("expect.amount", x.amountMsat === r.agreement.amount_msat, `expected ${x.amountMsat} msat`);
    if (x.payeePubkey !== undefined)
      add("expect.payee", x.payeePubkey === r.agreement.payee_pubkey, "receipt pays the node key you expect");
    if (x.network !== undefined)
      add("expect.network", x.network === r.network, `expected network ${x.network}`);
    if (x.obligationId !== undefined)
      add(
        "expect.obligation",
        x.obligationId === r.agreement.obligation_id,
        "receipt is for the obligation you expect",
      );
  }
  if (opts.seenReceiptIds)
    add("replay", !opts.seenReceiptIds.has(r.receipt_id), "receipt id has not been presented before");

  return finish(r);
}
