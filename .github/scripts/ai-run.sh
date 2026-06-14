#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node_bin="${GITCREW_NODE_BIN:-node}"
exec "$node_bin" "$script_dir/ai-run.js" "$@"
