# Deploy workflow for the backend. Build on the Mac with OrbStack (Docker), push
# to Forgejo, apply the k8s manifests, roll the Deployment to the new image.
# See deploy/README.md for the one-time secret setup and the confirm-items.

registry := "forgejo.tev.im"
owner := "aflatter"
image := registry / owner / "personal-dashboard-backend"
namespace := "personal-dashboard"
url := "https://personal-dashboard.braid-stargazer.ts.net"
tag := `git rev-parse --short HEAD 2>/dev/null || echo latest`

# List recipes.
default:
    @just --list

# Build the linux/amd64 image (arm Mac → x86_64 k3s, so the platform is explicit).
build:
    docker build --platform linux/amd64 --build-arg GIT_SHA={{tag}} -t {{image}}:{{tag}} .

# Push the built image to Forgejo (run `docker login {{registry}}` once first).
push: build
    docker push {{image}}:{{tag}}

# Apply manifests and roll the Deployment to the freshly pushed image.
deploy: push
    kubectl apply -f deploy/k8s/
    kubectl -n {{namespace}} set image deployment/dashboard-backend backend={{image}}:{{tag}}
    kubectl -n {{namespace}} rollout status deployment/dashboard-backend

# Store the Forgejo pull token in 1Password (prompts; nothing hits the shell
# history). Create the token in Forgejo first: User Settings → Applications →
# Access Tokens, scope `read:package` — pull-only, not your password.
registry-token:
    secretspec set -P deploy FORGEJO_REGISTRY_TOKEN

# Create/update both cluster Secrets from 1Password via secretspec. Idempotent,
# so this is also how you rotate. Values are injected as env vars and passed to
# kubectl on stdin — never as arguments (argv is readable via `ps`).
secrets:
    NAMESPACE={{namespace}} REGISTRY={{registry}} OWNER={{owner}} \
      secretspec run --profile deploy -- deploy/apply-secrets.sh registry
    NAMESPACE={{namespace}} REGISTRY={{registry}} OWNER={{owner}} \
      secretspec run --profile backend -- deploy/apply-secrets.sh backend

# E2E smoke: from a device with Tailscale on, /health must be 204 over HTTPS.
smoke:
    @printf 'GET %s/health -> ' '{{url}}'
    @curl -fsS -o /dev/null -w '%{http_code}\n' {{url}}/health

# Tail the backend logs.
logs:
    kubectl -n {{namespace}} logs -f deployment/dashboard-backend

# Restart the backend (e.g. after rotating the secret).
restart:
    kubectl -n {{namespace}} rollout restart deployment/dashboard-backend
