#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
# shellcheck disable=SC1091
source .env
set +a
export DATABASE_URL="$MIGRATE_DATABASE_URL"
exec npx "$@"
