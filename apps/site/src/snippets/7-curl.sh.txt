curl -X POST "$ORYNT_URL/v1/obligations/$OBLIGATION_ID/execute" \
  -H "authorization: Bearer $ORYNT_API_KEY" \
  -H "idempotency-key: idem_$(uuidgen | tr -d '-')"

# 200: the outcome is certain.
# 202: not certain yet (UNKNOWN or RECONCILING). Do not call execute again.
# 409 send_blocked_unresolved: a payment for this payout already exists or is unresolved.
