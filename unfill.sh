#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
node server/local-fixtures-cli.js unfill
