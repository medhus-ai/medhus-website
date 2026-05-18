#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$#" -eq 0 ]]; then
  exec node "$script_dir/ai-run.js" --health --all
fi
exec node "$script_dir/ai-run.js" --health "$@"
