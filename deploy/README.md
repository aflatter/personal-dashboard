# Deploying the backend

The always-on backend runs in **k3s**, reachable **only** over Tailscale (no
public ingress) at `https://personal-dashboard.braid-stargazer.ts.net`. The
platform layer (Tailscale operator, ACL, MagicDNS + HTTPS certs, storage class)
is provisioned separately in the infra repo; this repo owns the app's image and
manifests. See `docs/multi-device-sync-briefing.md` §7 for the full design.

## Frozen contract (from the infra repo)

| Constant      | Value                                               |
| ------------- | --------------------------------------------------- |
| namespace     | `personal-dashboard`                                |
| tailnetDomain | `braid-stargazer.ts.net`                            |
| serviceTag    | `tag:svc-personal-dashboard`                        |
| storageClass  | `local-path`                                        |
| registryHost  | `forgejo.tev.im`                                    |
| URL           | `https://personal-dashboard.braid-stargazer.ts.net` |

## What's here

- `../Dockerfile` — the backend image (Node 26 type-strips the .ts sources; only
  the SPA is built). Served same-origin: SPA at `/`, tRPC at `/api`, `/health`.
- `k8s/` — applied in order: namespace → PVC → Deployment → Service → Ingress.
- `secret.example.yaml` — template for the app secret (NOT applied; not real values).
- `../justfile` — `build` / `push` / `deploy` / `smoke`.

## One-time setup

1. **Registry login** (Forgejo has a public cert, so no CA wrangling):

   ```sh
   docker login forgejo.tev.im
   ```

2. **Image pull secret** in the namespace (so k3s can pull the private image).
   Create the namespace first, then the secret:

   ```sh
   kubectl apply -f deploy/k8s/00-namespace.yaml
   kubectl -n personal-dashboard create secret docker-registry forgejo-registry \
     --docker-server=forgejo.tev.im \
     --docker-username=<robot-user> \
     --docker-password=<robot-token>
   ```

3. **App secret** (Fastmail + Toggl) from 1Password — see `secret.example.yaml`
   for the exact `kubectl create secret generic dashboard-secrets …` command.
   `MONEYMONEY_ACCOUNT` is deliberately absent (MoneyMoney runs only on the Mac).

## Deploy

From the repo root (with Tailscale up and a kubeconfig pointing at the cluster):

```sh
just deploy      # build (linux/amd64) → push → apply manifests → roll to the new image
just smoke       # GET <url>/health → 204 over HTTPS
```

`just deploy` tags the image with the short git SHA and `set image`s the
Deployment to it, so each deploy is an immutable-tag rollout.

## E2E smoke (closes out the infra handoff)

From your **phone** with Tailscale **on**:
`https://personal-dashboard.braid-stargazer.ts.net/health` → **204** with a valid
certificate. With Tailscale **off**, the host must be unreachable.

## Confirm-items

- ~~Forgejo owner/org for the image path~~ — resolved: `owner := "aflatter"`
  (`justfile`), so images are `forgejo.tev.im/aflatter/personal-dashboard-backend`.
- **Multi-node k3s?** If the cluster has more than one node, pin the pod with a
  `nodeSelector`/affinity so it always reschedules onto the node holding the
  `local-path` volume (single-node: no action needed).

## Notes

- **Bank data**: the deployed backend never runs MoneyMoney (Linux/x86_64). The
  bank card shows the last value pushed by the Mac agent via `pushBankBacklog`,
  or the seeded value until the agent is wired. Inboxes, Toggl, rent/tax work
  live from the backend.
- **Backups**: `local-path` is node-local with no redundancy; backups are
  deferred (no critical data yet).
