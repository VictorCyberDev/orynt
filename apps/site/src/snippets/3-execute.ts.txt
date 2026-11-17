// 4. Execute, exactly once.
try {
  const { obligation, certain } = await orynt.obligations.execute(draft.id);

  if (!certain) {
    // HTTP 202: the outcome is not known yet (UNKNOWN or RECONCILING).
    // Do NOT call execute again. Wait for the wallet's own record instead:
    const paymentId = obligation.payment?.id;
    if (paymentId) await orynt.payments.reconcile(paymentId);
    const resolved = await orynt.obligations.waitUntilResolved(draft.id, { timeoutMs: 120_000 });
    console.log(resolved.state); // SETTLED, DEFINITIVELY_FAILED, or still UNKNOWN / RECONCILING
  }
} catch (err) {
  // A second send while a payment is unresolved is refused with HTTP 409.
  if (err instanceof OryntApiError && err.code === "send_blocked_unresolved") {
    console.log("Already in motion or unresolved:", err.requestId);
  } else throw err;
}
