#!/usr/bin/env bash
# Downloads bitcoind and lnd into .regtest/bin and REFUSES to continue unless the SHA-256 matches the pinned value (infra/regtest/versions.env).
# Linux x86_64 only. Nothing is executed here; execution happens in up.mjs.
set -euo pipefail
cd "$(dirname "$0")/../.."
source infra/regtest/versions.env
BIN=.regtest/bin; mkdir -p "$BIN/dl"
fetch() { # url sha256 file
  [ -f "$BIN/dl/$3" ] || curl -fL --retry 3 -o "$BIN/dl/$3" "$1"
  echo "$2  $BIN/dl/$3" | sha256sum -c - || { echo "CHECKSUM MISMATCH for $3 — refusing to use it" >&2; rm -f "$BIN/dl/$3"; exit 1; }
}
fetch "$BITCOIN_URL" "$BITCOIN_SHA256" bitcoin.tar.gz
fetch "$LND_URL" "$LND_SHA256" lnd.tar.gz
tar -xzf "$BIN/dl/bitcoin.tar.gz" -C "$BIN" && tar -xzf "$BIN/dl/lnd.tar.gz" -C "$BIN"
echo "bitcoind: $BIN/bitcoin-$BITCOIN_VERSION/bin/bitcoind"
echo "lnd:      $BIN/lnd-linux-amd64-$LND_VERSION/lnd"
