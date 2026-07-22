#!/usr/bin/env bash
# Create/update the cluster's Secrets from secretspec-injected environment
# variables. 1Password stays the single source of truth; nothing is written to
# disk or pasted into a shell. Idempotent (create --dry-run | apply), so this
# doubles as rotation.
#
# Not run directly — secretspec injects the values (see the justfile):
#   secretspec run -P deploy -- deploy/apply-secrets.sh registry
#   secretspec run           -- deploy/apply-secrets.sh backend
#
# SECRET HANDLING: values are read from the environment and handed to kubectl on
# stdin only. Nothing is passed as a command-line argument, because argv is world-
# readable via `ps` — which rules out the ergonomic `--from-literal=K=V` and
# `--docker-password=…` forms. `printf` is a shell builtin, so it spawns no
# process whose argv could carry a value, and the generated manifest flows
# through a pipe rather than a temp file.
#
# `registry` uses the deploy profile (the pull token); `backend` uses the backend
# profile — the same set the collector loads locally. MONEYMONEY_ACCOUNT is never
# sent to the cluster: MoneyMoney runs only on the Mac agent.
set -euo pipefail

NS="${NAMESPACE:-personal-dashboard}"
REGISTRY="${REGISTRY:-forgejo.tev.im}"
OWNER="${OWNER:-aflatter}"

case "${1:-}" in
registry)
  : "${FORGEJO_REGISTRY_TOKEN:?not injected — run: secretspec run --profile deploy -- $0 registry}"
  # Build the dockerconfigjson by hand so the token never becomes an argument.
  auth=$(printf '%s:%s' "$OWNER" "$FORGEJO_REGISTRY_TOKEN" | base64 | tr -d '\n')
  printf '{"auths":{"%s":{"auth":"%s"}}}' "$REGISTRY" "$auth" |
    kubectl -n "$NS" create secret generic forgejo-registry \
      --type=kubernetes.io/dockerconfigjson \
      --from-file=.dockerconfigjson=/dev/stdin \
      --dry-run=client -o yaml |
    kubectl apply -f -
  ;;
backend)
  lines=()
  for key in FASTMAIL_TOKEN_PERSONAL FASTMAIL_TOKEN_WORK TOGGL_API_TOKEN TOGGL_WORKSPACE_ID; do
    value="${!key:-}"
    [ -n "$value" ] && lines+=("$key=$value")
  done
  if [ ${#lines[@]} -eq 0 ]; then
    echo "no backend secrets injected — run: secretspec run --profile backend -- $0 backend" >&2
    exit 1
  fi
  # --from-env-file reads KEY=VALUE pairs from stdin; the array never reaches argv.
  printf '%s\n' "${lines[@]}" |
    kubectl -n "$NS" create secret generic dashboard-secrets \
      --from-env-file=/dev/stdin \
      --dry-run=client -o yaml |
    kubectl apply -f -
  ;;
*)
  echo "usage: $0 {registry|backend}" >&2
  exit 2
  ;;
esac
