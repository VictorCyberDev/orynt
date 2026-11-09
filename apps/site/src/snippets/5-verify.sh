# Build the verifier once (it lives in the repository, next to the SDK).
pnpm --filter @orynt/verifier build

# Check the receipt offline. Get the issuer's public key out-of-band; do not trust
# a key only because the receipt carries it.
node packages/verifier/dist/orynt-verify.mjs receipt.json \
  --trust-key <issuer-public-key-hex> \
  --expect-payment-hash <payment-hash-hex> \
  --expect-amount-msat 250000000 \
  --expect-network regtest

# Exit codes: 0 verified | 1 rejected | 2 usage or file error
#             3 intact, but issuer not trusted | 4 simulator receipt (not a real payment)
