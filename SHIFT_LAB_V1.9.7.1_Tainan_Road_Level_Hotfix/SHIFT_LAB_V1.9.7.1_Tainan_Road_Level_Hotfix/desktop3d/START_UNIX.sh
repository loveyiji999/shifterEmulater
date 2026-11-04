#!/bin/sh
set -eu
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js 22+ or 20.19+ required"; exit 1; }
command -v npm >/dev/null || { echo "npm required"; exit 1; }
if [ ! -f node_modules/three/package.json ]; then npm install --no-audit --no-fund; fi
npm run dev:open
