#!/usr/bin/env bash

set -euo pipefail

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required." >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
gateway_url="${GATEWAY_URL:-http://localhost:3000}/api/users"
backend_url="${BACKEND_URL:-http://localhost:3001}/api/users"
token="${ACCESS_TOKEN:-}"

if [[ -z "$token" ]]; then
  token="$($script_dir/get-test-token.sh)"
fi

run_scenario() {
  local name="$1"
  local expected_status="$2"
  shift 2

  local response
  local body
  local status
  response="$(curl --silent --show-error --write-out $'\n%{http_code}' "$@")"
  status="${response##*$'\n'}"
  body="${response%$'\n'*}"

  printf '\n[%s] expected %s, received %s\n' "$name" "$expected_status" "$status"
  [[ -n "$body" ]] && printf '%s\n' "$body"

  if [[ "$status" != "$expected_status" ]]; then
    return 1
  fi
}

run_scenario "Valid token" 200 \
  "$gateway_url" \
  --header "Authorization: Bearer $token" \
  --header "X-Verified-User: spoofed-user"

run_scenario "Create user" 201 \
  "$gateway_url" \
  --request POST \
  --header "Authorization: Bearer $token" \
  --header 'Content-Type: application/json' \
  --data '{"name":"Ada Lovelace","email":"ada@example.com"}'

run_scenario "Missing token" 401 "$gateway_url"

run_scenario "Invalid token" 401 \
  "$gateway_url" \
  --header 'Authorization: Bearer invalid-token'

run_scenario "Direct backend access" 403 "$backend_url"

run_scenario "Invalid request body" 400 \
  "$gateway_url" \
  --request POST \
  --header "Authorization: Bearer $token" \
  --header 'Content-Type: application/json' \
  --data '{"name":"","email":"invalid"}'

printf '\nAll test scenarios passed.\n'