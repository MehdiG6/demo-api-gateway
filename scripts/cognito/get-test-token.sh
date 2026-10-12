#!/usr/bin/env bash

set -euo pipefail

for dependency in curl node openssl; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "Error: $dependency is required." >&2
    exit 1
  fi
done

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd -- "$script_dir/../.." && pwd)"

if [[ -f "$repository_root/.env" ]]; then
  while IFS='=' read -r key value; do
    value="${value%$'\r'}"
    case "$key" in
      COGNITO_CLIENT_ID | COGNITO_HOSTED_UI_URL | COGNITO_REDIRECT_URI | COGNITO_OAUTH_SCOPES)
        if [[ -z "${!key:-}" ]]; then
          printf -v "$key" '%s' "$value"
          export "$key"
        fi
        ;;
    esac
  done <"$repository_root/.env"
fi

client_id="${COGNITO_CLIENT_ID:-}"
hosted_ui_url="${COGNITO_HOSTED_UI_URL:-}"
redirect_uri="${COGNITO_REDIRECT_URI:-http://localhost:3000/callback}"
scopes="${COGNITO_OAUTH_SCOPES:-openid demo-api/users.read demo-api/users.write}"

if [[ -z "$client_id" ]]; then
  echo "Error: set COGNITO_CLIENT_ID in the environment or .env." >&2
  exit 1
fi

if [[ -z "$hosted_ui_url" ]]; then
  echo "Error: set COGNITO_HOSTED_UI_URL in the environment or .env." >&2
  exit 1
fi

if [[ ! -r /dev/tty ]]; then
  echo "Error: a terminal is required for the OAuth callback prompt." >&2
  exit 1
fi

code_verifier="$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n')"
code_challenge="$(
  printf '%s' "$code_verifier" \
    | openssl dgst -sha256 -binary \
    | openssl base64 -A \
    | tr '+/' '-_' \
    | tr -d '='
)"
state="$(openssl rand -hex 16)"

open_browser() {
  local url="$1"

  if [[ -n "${WSL_DISTRO_NAME:-}" ]] && command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -NonInteractive -Command 'Start-Process $args[0]' "$url"
  elif [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
    open "$url"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url"
  else
    return 1
  fi
}

authorization_url="$(node -e '
  const [baseUrl, clientId, redirectUri, scope, challenge, state] = process.argv.slice(1);
  const url = new URL("/oauth2/authorize", baseUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  });
  process.stdout.write(url.toString());
' "$hosted_ui_url" "$client_id" "$redirect_uri" "$scopes" "$code_challenge" "$state")"

printf 'Open this URL and sign in:\n\n%s\n\n' "$authorization_url" >&2
if ! open_browser "$authorization_url" >/dev/null 2>&1; then
  echo "Could not open a browser automatically. Open the URL above manually." >&2
fi

read -r -p "Paste the complete callback URL: " callback_url </dev/tty
mapfile -t callback_values < <(node -e '
  const url = new URL(process.argv[1]);
  process.stdout.write(`${url.searchParams.get("code") ?? ""}\n${url.searchParams.get("state") ?? ""}\n`);
' "$callback_url")
authorization_code="${callback_values[0]:-}"
returned_state="${callback_values[1]:-}"

if [[ -z "$authorization_code" || "$returned_state" != "$state" ]]; then
  echo "Error: callback is missing a valid authorization code or state." >&2
  exit 1
fi

token_response="$(curl --silent --show-error --fail-with-body \
  --request POST \
  --url "${hosted_ui_url%/}/oauth2/token" \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode "client_id=$client_id" \
  --data-urlencode "code=$authorization_code" \
  --data-urlencode "redirect_uri=$redirect_uri" \
  --data-urlencode "code_verifier=$code_verifier")"

node -e '
  const fs = require("node:fs");
  const response = JSON.parse(fs.readFileSync(0, "utf8"));
  if (typeof response.access_token !== "string") {
    throw new Error(response.error_description ?? "Cognito did not return an access token");
  }
  process.stdout.write(response.access_token);
  console.error("Successfully retrieved Cognito access token.");
' <<<"$token_response"