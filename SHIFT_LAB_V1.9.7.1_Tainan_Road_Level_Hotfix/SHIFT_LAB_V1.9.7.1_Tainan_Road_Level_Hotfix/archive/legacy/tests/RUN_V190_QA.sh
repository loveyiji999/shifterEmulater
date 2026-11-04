#!/bin/sh
# Non-WebGL policy, actual original physics iframe, and all inherited tests.
# Native Rapier/Three.js acceptance is a separate browser command.
set -eu
cd "$(dirname "$0")/../../.."
cd desktop3d && npm run qa:all && cd ..
node desktop3d/tests/validate-road-v2.mjs --stress
python3 archive/legacy/browser-tests/browser_v190_core.py
python3 -m unittest discover -s archive/legacy/tests -p 'test_v*.py'
echo 'PASS: v1.9.0 source + seeded geometry + original physics iframe. Rapier WebGL pending.'
