#!/bin/sh
# Source / legacy-browser regressions. The true Rapier WASM test is separate.
set -eu
cd "$(dirname "$0")/../../.."
for test in desktop3d/tests/validate-*.mjs; do node "$test"; done
for test in tests/test_v*.py; do
  echo "=== $(basename "$test") ==="
  python -m unittest discover -s archive/legacy/tests -p "$(basename "$test")" -v
done
echo "PASS: source + legacy iframe QA. Run archive/legacy/browser-tests/browser_v1893.py for REAL WASM/WebGL acceptance."
