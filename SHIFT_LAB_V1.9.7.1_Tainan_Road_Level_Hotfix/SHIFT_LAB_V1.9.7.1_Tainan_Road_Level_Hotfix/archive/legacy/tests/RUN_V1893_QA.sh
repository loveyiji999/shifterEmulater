#!/bin/sh
# Node policy and all Python/Chromium original-core regressions.
# Real WebGL2/Rapier must be executed separately after npm install + Vite.
set -eu
cd "$(dirname "$0")/../../.."
for test in desktop3d/tests/validate-*.mjs; do node "$test"; done
for test in tests/test_v*.py; do
  echo "=== $(basename "$test") ==="
  python -m unittest discover -s archive/legacy/tests -p "$(basename "$test")" -q
done
echo "PASS source/legacy; real Rapier: python archive/legacy/browser-tests/browser_v1893.py"
