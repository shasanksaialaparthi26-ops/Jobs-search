#!/usr/bin/env bash
set -euo pipefail

KCADM=/opt/keycloak/bin/kcadm.sh
SERVER=http://keycloak:8080
REALM=jobs-search

until "$KCADM" config credentials \
  --server "$SERVER" \
  --realm master \
  --user "$KEYCLOAK_ADMIN_USERNAME" \
  --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null 2>&1; do
  echo "Waiting for Keycloak..."
  sleep 3
done

if ! "$KCADM" get "realms/$REALM" >/dev/null 2>&1; then
  "$KCADM" create realms -s "realm=$REALM" -s enabled=true
fi
"$KCADM" update "realms/$REALM" -s 'passwordPolicy=length(12)'

if ! "$KCADM" get clients -r "$REALM" -q clientId=user-service | grep -q '"clientId"'; then
  "$KCADM" create clients -r "$REALM" \
    -s clientId=user-service \
    -s enabled=true \
    -s publicClient=false \
    -s serviceAccountsEnabled=true \
    -s clientAuthenticatorType=client-secret \
    -s "secret=$KEYCLOAK_CLIENT_SECRET"
fi
USER_SERVICE_CLIENT_ID=$("$KCADM" get clients -r "$REALM" -q clientId=user-service \
  | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
if [ -z "$USER_SERVICE_CLIENT_ID" ]; then
  echo "Could not find user-service client." >&2
  exit 1
fi
"$KCADM" update "clients/$USER_SERVICE_CLIENT_ID" -r "$REALM" \
  -s publicClient=false \
  -s serviceAccountsEnabled=true \
  -s clientAuthenticatorType=client-secret \
  -s "secret=$KEYCLOAK_CLIENT_SECRET"

if ! "$KCADM" get clients -r "$REALM" -q clientId=jobs-web | grep -q '"clientId"'; then
  "$KCADM" create clients -r "$REALM" \
    -s clientId=jobs-web \
    -s enabled=true \
    -s publicClient=true \
    -s standardFlowEnabled=true \
    -s directAccessGrantsEnabled=false \
    -s "redirectUris=[\"$JOBS_WEB_REDIRECT_URI\"]" \
    -s "webOrigins=[\"$JOBS_WEB_ORIGIN\"]"
fi

WEB_CLIENT_ID=$("$KCADM" get clients -r "$REALM" -q clientId=jobs-web \
  | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
if [ -z "$WEB_CLIENT_ID" ]; then
  echo "Could not find jobs-web client." >&2
  exit 1
fi
if ! "$KCADM" get "clients/$WEB_CLIENT_ID/protocol-mappers/models" -r "$REALM" \
  | grep -q '"name"[[:space:]]*:[[:space:]]*"jobs-api-audience"'; then
  "$KCADM" create "clients/$WEB_CLIENT_ID/protocol-mappers/models" -r "$REALM" \
    -s name=jobs-api-audience \
    -s protocol=openid-connect \
    -s protocolMapper=oidc-audience-mapper \
    -s 'config."included.client.audience"=jobs-api' \
    -s 'config."access.token.claim"=true' \
    -s 'config."id.token.claim"=false'
fi

REALM_MANAGEMENT_ID=$("$KCADM" get clients -r "$REALM" -q clientId=realm-management \
  | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
if [ -z "$REALM_MANAGEMENT_ID" ]; then
  echo "Could not find Keycloak realm-management client." >&2
  exit 1
fi
SERVICE_ACCOUNT_ID=$("$KCADM" get users -r "$REALM" -q username=service-account-user-service \
  | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
if [ -z "$SERVICE_ACCOUNT_ID" ]; then
  echo "Could not find user-service service account." >&2
  exit 1
fi
if ! "$KCADM" get "users/$SERVICE_ACCOUNT_ID/role-mappings/clients/$REALM_MANAGEMENT_ID" -r "$REALM" \
  | grep -q '"name"[[:space:]]*:[[:space:]]*"manage-users"'; then
  "$KCADM" add-roles -r "$REALM" \
    --uusername service-account-user-service \
    --cclientid realm-management \
    --rolename manage-users
fi

configure_identity_provider() {
  local alias="$1"
  local provider="$2"
  local client_id="$3"
  local client_secret="$4"
  local default_scope="$5"
  [ -n "$client_id" ] && [ -n "$client_secret" ] || return 0

  if "$KCADM" get "identity-provider/instances/$alias" -r "$REALM" >/dev/null 2>&1; then
    "$KCADM" update "identity-provider/instances/$alias" -r "$REALM" \
      -s "providerId=$provider" \
      -s enabled=true \
      -s "config.clientId=$client_id" \
      -s "config.clientSecret=$client_secret" \
      -s "config.defaultScope=$default_scope"
  else
    "$KCADM" create identity-provider/instances -r "$REALM" \
      -s "alias=$alias" \
      -s "providerId=$provider" \
      -s enabled=true \
      -s "config.clientId=$client_id" \
      -s "config.clientSecret=$client_secret" \
      -s "config.defaultScope=$default_scope"
  fi
}

configure_identity_provider google google "$GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_SECRET" "openid email profile"
configure_identity_provider github github "$GITHUB_CLIENT_ID" "$GITHUB_CLIENT_SECRET" "user:email"

echo "Keycloak realm '$REALM' is configured."
