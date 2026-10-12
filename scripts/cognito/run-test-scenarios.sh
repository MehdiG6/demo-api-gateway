#!/usr/bin/env bash

set -euo pipefail

for dependency in curl node; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "Error: $dependency is required." >&2
    exit 1
  fi
done

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
  local status
  response="$(curl --silent --show-error --write-out $'\n%{http_code}' "$@")"
  status="${response##*$'\n'}"
  scenario_body="${response%$'\n'*}"

  printf '\n[%s] expected %s, received %s\n' "$name" "$expected_status" "$status"
  [[ -n "$scenario_body" ]] && printf '%s\n' "$scenario_body"

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

created_user_id="$(node -e '
  const user = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  if (typeof user.id !== "string" || user.id.length === 0) {
    throw new Error("Create user response did not include an ID");
  }
  process.stdout.write(user.id);
' <<<"$scenario_body")"

run_scenario "Get all users" 200 \
  "$gateway_url" \
  --header "Authorization: Bearer $token"

node -e '
  const users = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  if (!Array.isArray(users) || !users.some((user) => user.id === process.argv[1])) {
    throw new Error("Get all users response did not include the created user");
  }
' "$created_user_id" <<<"$scenario_body"

run_scenario "Get user by ID" 200 \
  "$gateway_url/$created_user_id" \
  --header "Authorization: Bearer $token"

node -e '
  const user = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  if (user.id !== process.argv[1]) {
    throw new Error("Get user by ID returned a different user");
  }
' "$created_user_id" <<<"$scenario_body"

run_scenario "Update user" 200 \
  "$gateway_url/$created_user_id" \
  --request PUT \
  --header "Authorization: Bearer $token" \
  --header 'Content-Type: application/json' \
  --data '{"name":"Updated API Scenario User","email":"ada@example.com"}'

node -e '
  const user = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  if (user.id !== process.argv[1] || user.name !== "Updated API Scenario User") {
    throw new Error("Update user response did not contain the updated user");
  }
' "$created_user_id" <<<"$scenario_body"

run_scenario "Delete user" 204 \
  "$gateway_url/$created_user_id" \
  --request DELETE \
  --header "Authorization: Bearer $token"

run_scenario "Deleted user is not found" 404 \
  "$gateway_url/$created_user_id" \
  --header "Authorization: Bearer $token"

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