# Deploy workflow for the backend. Build on the Mac with OrbStack (Docker), push
# to Forgejo, apply the k8s manifests, roll the Deployment to the new image.
# See deploy/README.md for the one-time secret setup and the confirm-items.

registry := "forgejo.tev.im"
owner := "personal" # TODO: confirm the Forgejo owner/org that holds the image
image := registry / owner / "personal-dashboard-backend"
namespace := "personal-dashboard"
url := "https://personal-dashboard.braid-stargazer.ts.net"
tag := `git rev-parse --short HEAD 2>/dev/null || echo latest`

# List recipes.
default:
    @just --list

# Build the linux/amd64 image (arm Mac → x86_64 k3s, so the platform is explicit).
build:
    docker build --platform linux/amd64 -t {{image}}:{{tag}} .

# Push the built image to Forgejo (run `docker login {{registry}}` once first).
push: build
    docker push {{image}}:{{tag}}

# Apply manifests and roll the Deployment to the freshly pushed image.
deploy: push
    kubectl apply -f deploy/k8s/
    kubectl -n {{namespace}} set image deployment/dashboard-backend backend={{image}}:{{tag}}
    kubectl -n {{namespace}} rollout status deployment/dashboard-backend

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
