#!/bin/sh
set -eu
cd "$(dirname "$0")/../../.."
python -m unittest discover -s archive/legacy/tests -p 'test_v18*.py'
