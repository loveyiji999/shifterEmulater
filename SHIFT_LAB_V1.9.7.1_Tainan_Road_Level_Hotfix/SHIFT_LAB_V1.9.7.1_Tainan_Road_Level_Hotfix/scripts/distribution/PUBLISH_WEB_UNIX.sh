#!/bin/sh
set -eu
cd "$(dirname "$0")/../../desktop3d"
[ -f node_modules/three/package.json ] || npm install --no-audit --no-fund
npm run build
printf 'Publish desktop3d/dist contents as one static website.
'
