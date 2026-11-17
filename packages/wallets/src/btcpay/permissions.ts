/**
 * Interpretation of a Greenfield API key's permission list (GET /api/v1/api-keys/current).
 *
 * Facts, from BTCPay Server source (BTCPayServer.Client/Permissions.cs, BTCPayServer/Hosting/BTCPayServerServices.cs,
 * GreenfieldLightningNodeApiController.Store.cs; master as read on 2026-11-11, version 2.4.7):
 *  - Store-level Lightning endpoints under /api/v1/stores/{storeId}/lightning/{cryptoCode}/ — info, payments/{hash}
 *    AND invoices/pay — are ALL authorised by the single policy `btcpay.store.canuselightningnode`.
 *    There is NO read-only permission that allows payment lookup: whoever can look a payment up can also pay,
 *    open channels and connect to peers. (`canviewlightninginvoice` / `cancreatelightninginvoice` are CHILDREN of
 *    `canuselightningnode`, not parents, and do not authorise pay or payment lookup. The published swagger lists
 *    `cancreatelightninginvoice` for the store pay endpoint; the controller attribute says otherwise.)
 *  - `btcpay.store.canmodifystoresettings` and `unrestricted` include `canuselightningnode`.
 *  - A permission may carry a scope: `policy:storeId`. Without a scope it applies to ALL stores of the user.
 *  - A key can only narrow its user's rights, never widen them, so the key's list is an UPPER BOUND on what is
 *    allowed. The authoritative answer is the server's behaviour, which the provider probes separately.
 */
export const STORE_LIGHTNING_USE = "btcpay.store.canuselightningnode";
const STORE_LIGHTNING_VIEW_INVOICE = "btcpay.store.canviewlightninginvoice";
const STORE_LIGHTNING_CREATE_INVOICE = "btcpay.store.cancreatelightninginvoice";
const STORE_MODIFY_SETTINGS = "btcpay.store.canmodifystoresettings";
const UNRESTRICTED = "unrestricted";

export interface ParsedPermission {
  policy: string;
  scope: string | null;
  raw: string;
}

export function parsePermission(raw: string): ParsedPermission | null {
  const s = raw.trim();
  const i = s.indexOf(":");
  const policy = (i === -1 ? s : s.slice(0, i)).toLowerCase();
  const scope = i === -1 ? null : s.slice(i + 1);
  if (!/^(?:btcpay\.(?:[a-z0-9]+\.)*[a-z0-9]+|unrestricted)$/.test(policy)) return null;
  if (scope !== null && scope.length === 0) return null;
  return { policy, scope, raw: s };
}

export interface PermissionAssessment {
  /** The key's list grants `canuselightningnode` for this store (directly, via canmodifystoresettings, or via unrestricted). */
  grantsLightningUse: boolean;
  /** The permission string that grants it, if any. */
  grantedBy: string | null;
  /** The granting permission is scoped to exactly this store (the least-privilege form). */
  grantIsStoreScoped: boolean;
  /** Permissions beyond the minimum `canuselightningnode:<storeId>`; each entry explains why. */
  excess: string[];
  /** Operator-facing warnings (never contains secrets). */
  warnings: string[];
}

export function assessApiKeyPermissions(
  permissions: readonly string[],
  storeId: string,
): PermissionAssessment {
  const parsed = permissions.map(parsePermission).filter((p): p is ParsedPermission => p !== null);
  const granting = (p: ParsedPermission): boolean => {
    if (p.policy === UNRESTRICTED) return p.scope === null;
    if (p.policy === STORE_LIGHTNING_USE || p.policy === STORE_MODIFY_SETTINGS)
      return p.scope === null || p.scope === storeId;
    return false;
  };
  // Prefer the least-privilege grant when several are present.
  const grants = parsed.filter(granting);
  const best =
    grants.find((p) => p.policy === STORE_LIGHTNING_USE && p.scope === storeId) ?? grants[0] ?? null;

  const excess: string[] = [];
  for (const p of parsed) {
    const minimal =
      p.scope === storeId &&
      (p.policy === STORE_LIGHTNING_USE ||
        p.policy === STORE_LIGHTNING_VIEW_INVOICE ||
        p.policy === STORE_LIGHTNING_CREATE_INVOICE);
    if (minimal) continue;
    if (p.policy === UNRESTRICTED) excess.push(`${p.raw}: full account access`);
    else if (p.policy.startsWith("btcpay.store.") && p.scope === null)
      excess.push(`${p.raw}: applies to ALL stores of the user`);
    else if (p.policy.startsWith("btcpay.store.") && p.scope !== storeId)
      excess.push(`${p.raw}: scoped to a different store`);
    else if (p.policy.startsWith("btcpay.store.")) excess.push(`${p.raw}: not needed for paying`);
    else excess.push(`${p.raw}: server/user-level permission, not needed for paying`);
  }

  const warnings: string[] = [];
  if (!best) {
    warnings.push(
      `The API key does not list ${STORE_LIGHTNING_USE} for this store (it is required both to pay and to look payments up).`,
    );
  } else {
    if (best.scope === null || best.policy !== STORE_LIGHTNING_USE) {
      warnings.push(
        `The granting permission "${best.raw}" is broader than ${STORE_LIGHTNING_USE}:<storeId>. Create a key limited to that single permission and this store.`,
      );
    }
  }
  if (best) {
    warnings.push(
      `BTCPay has no payment-only permission: ${STORE_LIGHTNING_USE} also allows opening channels and connecting to peers on this store's node. ` +
        "Treat the key as a spending credential.",
    );
  }
  if (excess.length > 0 && best)
    warnings.push(`The key carries more than the minimum: ${excess.join("; ")}.`);

  return {
    grantsLightningUse: best !== null,
    grantedBy: best?.raw ?? null,
    grantIsStoreScoped: best !== null && best.scope === storeId,
    excess,
    warnings,
  };
}
