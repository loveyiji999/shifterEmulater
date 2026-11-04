#!/bin/sh
set -eu
cd "$(dirname "$0")/../../.."
# Optional: export P1_RAW_DIR=/path/to/source before launching, to enable full real P1 reprocessing.
# Without originals, those specific source-data tests are correctly skipped.
for case in test_v183.py test_v184.py test_v185.py; do
  echo "RUN $case"
  python -m unittest discover -s archive/legacy/tests -p "$case" -v
  echo "PASS $case"
done
