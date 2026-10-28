#!/usr/bin/env bash
# Pin Pactwright-contracts test vectors into @pactwright/core (ADR-015).
# Usage: scripts/fetch-vectors.sh <git ref or commit of Pactwright-contracts>
# Replaced by downloading release assets once C-18 publishes them.
set -euo pipefail
ref="${1:?usage: fetch-vectors.sh <ref>}"
dest="$(dirname "$0")/../packages/core/test/vectors/pactwright"
base="https://raw.githubusercontent.com/Pactwright/Pactwright-contracts/${ref}/test-vectors"
for f in nonce pact_id condition_hash verdict_attestation usage_voucher delivery_receipt receipt_leaf merkle; do
  curl -fsSL "${base}/${f}.json" -o "${dest}/${f}.json"
done
echo "${ref}" > "${dest}/COMMIT"
echo "Pinned Pactwright-contracts test vectors at ${ref}."
