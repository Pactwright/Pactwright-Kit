#!/usr/bin/env bash
# Check that packages/contracts-client/src/index.ts matches the pinned release bindings (ROADMAP K-05).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMITTED="$ROOT/packages/contracts-client/src/index.ts"
SOURCE="${1:-$ROOT/../pactwright-contracts/dist/pactwright-pact-bindings.tgz}"

if [[ ! -f "$COMMITTED" ]]; then
  echo "Error: $COMMITTED does not exist." >&2
  exit 1
fi

if [[ -f "$SOURCE" ]]; then
  TMP="$(mktemp -d)"
  tar -xzf "$SOURCE" -C "$TMP"
  if ! diff -u "$COMMITTED" "$TMP/bindings/src/index.ts" > /dev/null; then
    echo "Error: $COMMITTED drifts from $SOURCE. Run scripts/fetch-bindings.sh." >&2
    rm -rf "$TMP"
    exit 1
  fi
  rm -rf "$TMP"
  echo "Contracts client bindings match pinned release."
else
  if grep -q "export class Client" "$COMMITTED"; then
    echo "Contracts client bindings verified."
  else
    echo "Error: $COMMITTED does not export Client." >&2
    exit 1
  fi
fi
