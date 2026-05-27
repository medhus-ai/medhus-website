#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--" ]]; then
  echo "usage: doppler-run.sh -- <command> [args...]" >&2
  exit 2
fi
shift

token_file="${DOPPLER_SERVICE_TOKEN_FILE:-$HOME/.config/gitcrew/doppler-service-token}"
project="${DOPPLER_PROJECT:-gitcrew}"
github_repository="${GITHUB_REPOSITORY:-}"
config="${DOPPLER_CONFIG:-${github_repository##*/}}"

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
