#!/usr/bin/env bash
# Builds dist/Case_Compass_v3_Complete.zip: the app, offline assets, resource data, documentation,
# installation guide, fictional samples, scripts, and tests. Usage: bash scripts/package.sh
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build-sw.mjs
mkdir -p dist
OUT="dist/Case_Compass_v3_Complete.zip"
rm -f "$OUT"
zip -qr "$OUT" index.html manifest.webmanifest sw.js package.json README.md CHANGELOG.md VERSION .gitignore \
  css js data icons docs samples scripts tests -x "*.DS_Store" "*/__pycache__/*"
echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
