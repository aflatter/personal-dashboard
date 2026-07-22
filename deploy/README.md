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
- `apply-secrets.sh` — builds the cluster Secrets from secretspec-injected env
  vars (stdin only, never argv). Driven by `just secrets`, not run directly.
- `../justfile` — `build` / `push` / `deploy` / `smoke`.

## One-time setup

1. **Registry login** (Forgejo has a public cert, so no CA wrangling):

   ```sh
   docker login forgejo.tev.im
   ```

2. **Forgejo pull token** — k8s authenticates to the registry with an
   `imagePullSecret`; without it the pull falls back to anonymous and Forgejo
   answers `401` (`ImagePullBackOff`). The Mac's `~/.docker/config.json` can't be
   reused: it uses the `osxkeychain` helper, so it holds a keychain pointer, not a
   credential.

   Create the token in Forgejo (User Settings → Applications → Access Tokens,
   scope **`read:package`** — pull-only, not your password), then store it in
   1Password via secretspec:

   ```sh
   just registry-token     # prompts, writes to the vault (deploy profile)
   ```

3. **Create the cluster Secrets** from 1Password — the namespace must exist first:

   ```sh
   kubectl apply -f deploy/k8s/00-namespace.yaml
   just secrets            # forgejo-registry + dashboard-secrets
   ```

   `just secrets` is idempotent, so it is also how you **rotate**: update the
   value in 1Password and re-run it, then `just restart`.

**On secret handling.** 1Password is the single source of truth for both, reached
through the same `secretspec` used at runtime — the deploy-only token lives in a
separate `deploy` profile so the collector never resolves it. `secretspec run`
injects values as environment variables, and `deploy/apply-secrets.sh` passes
them to `kubectl` on **stdin only** — never as command-line arguments, since argv
is readable by any local process via `ps`. MoneyMoney appears nowhere in this
picture: it needs no credential, and its account selector is Mac-app config
(`moneyMoneyAccount` in `~/.config/personal-dashboard/config.json`), not a secret
— so it is in neither the vault nor the cluster. The Mac agent pushes the backlog
in over the tailnet instead.

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

- **Registry linking**: the image carries
  `org.opencontainers.image.source=https://forgejo.tev.im/aflatter/personal-dashboard`,
  which associates the pushed package with the repo in Forgejo (the image name
  doesn't match the repo name, so the naming convention wouldn't auto-link it).
  Forgejo links on **first creation of the package only** — if a package ever
  gets created unlinked, delete it in Forgejo and push again. `just build` also
  stamps `org.opencontainers.image.revision` with the git SHA.

- **Bank data**: the deployed backend never runs MoneyMoney (Linux/x86_64). The
  bank card shows the last value pushed by the Mac agent via `pushBankBacklog`,
  or the seeded value until the agent is wired. Inboxes, Toggl, rent/tax work
  live from the backend.
- **Backups**: `local-path` is node-local with no redundancy; backups are
  deferred (no critical data yet).
