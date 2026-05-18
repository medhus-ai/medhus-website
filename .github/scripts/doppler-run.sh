#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--" ]]; then
  echo "usage: doppler-run.sh -- <command> [args...]" >&2
  exit 2
fi
shift

token_file="${DOPPLER_SERVICE_TOKEN_FILE:-$HOME/.config/engineering-automation/doppler-service-token}"
project="${DOPPLER_PROJECT:-engineering-automation}"
config="${DOPPLER_CONFIG:-${GITHUB_REPOSITORY##*/}}"

if [[ -z "$config" ]]; then
  echo "DOPPLER_CONFIG is required when GITHUB_REPOSITORY is unavailable" >&2
  exit 2
fi

if [[ ! -r "$token_file" ]]; then
  echo "Doppler service token file not readable: $token_file" >&2
  exit 1
fi

export DOPPLER_TOKEN
DOPPLER_TOKEN="$(tr -d '\n' < "$token_file")"
exec doppler run --project "$project" --config "$config" -- "$@"
