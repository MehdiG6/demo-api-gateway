#!/usr/bin/env bash

set -euo pipefail

if ! command -v aws >/dev/null 2>&1; then
  echo "Error: AWS CLI is required." >&2
  exit 1
fi

region="${AWS_REGION:-ap-southeast-2}"
client_id="${COGNITO_CLIENT_ID:-${COGNITO_AUDIENCE:-}}"
username="${COGNITO_USERNAME:-${1:-}}"

if [[ -z "$client_id" ]]; then
  echo "Error: set COGNITO_CLIENT_ID or COGNITO_AUDIENCE." >&2
  exit 1
fi

if [[ -z "$username" ]]; then
  echo "Usage: COGNITO_AUDIENCE=<client-id> $0 <username>" >&2
  exit 1
fi

if [[ -n "${COGNITO_PASSWORD:-}" ]]; then
  password="$COGNITO_PASSWORD"
elif [[ -r /dev/tty ]]; then
  read -r -s -p "Cognito password: " password </dev/tty
  echo >&2
else
  echo "Error: no terminal is available for the password prompt." >&2
  exit 1
fi

trap 'unset password' EXIT

aws cognito-idp initiate-auth \
  --region "$region" \
  --client-id "$client_id" \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters "USERNAME=$username,PASSWORD=$password" \
  --query 'AuthenticationResult.IdToken' \
  --output text