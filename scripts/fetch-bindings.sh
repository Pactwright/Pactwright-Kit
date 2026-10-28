#!/usr/bin/env bash
# Fetch or unpack TypeScript bindings for the pact contract into packages/contracts-client/src/ (ROADMAP K-05).
# Usage: scripts/fetch-bindings.sh [contracts-dir-or-archive]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/packages/contracts-client/src"
SOURCE="${1:-$ROOT/../pactwright-contracts/dist/pactwright-pact-bindings.tgz}"

mkdir -p "$DEST"

if [[ -f "$SOURCE" ]]; then
  TMP="$(mktemp -d)"
  tar -xzf "$SOURCE" -C "$TMP"
  cp "$TMP/bindings/src/index.ts" "$DEST/index.ts"
  rm -rf "$TMP"
  echo "Unpacked bindings from $SOURCE into $DEST/index.ts."
elif [[ -d "$SOURCE" && -f "$SOURCE/dist/bindings/src/index.ts" ]]; then
  cp "$SOURCE/dist/bindings/src/index.ts" "$DEST/index.ts"
  echo "Copied bindings from $SOURCE into $DEST/index.ts."
else
  echo "Source $SOURCE not found. Expected tarball or contracts directory." >&2
  exit 1
fi
