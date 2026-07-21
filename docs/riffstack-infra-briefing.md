# Riffstack infra briefing — Tailscale + k3s platform for the personal dashboard

**Audience:** the agent/session working in the **Riffstack** infra repo (Pulumi
IaC). You do **not** need the `personal-dashboard` app repo to do this work — this
briefing is self-contained. It is the platform half of a two-repo split; the app
half is implemented separately against the same interface contract (§4).

**Provenance:** derived from `personal-dashboard/docs/multi-device-sync-briefing.md`
§7 (deployment) and §8 (modules). If a detail here conflicts with a later version
of that doc, that doc wins — but the interface contract in §4 below is the source
of truth for the seam between the two repos.

---

## 1. Goal, in one paragraph

A single-user "personal dashboard" runs an always-on backend service in the
user's **k3s** cluster (`x86_64`, Linux). It must be reachable **privately** from
the user's **iPhone** (as an installable PWA) and **MacBook** over **Tailscale** —
**no public ingress, no app-level auth.** The tailnet **is** the authentication.
Your job (Riffstack) is to provision the **platform layer** so the app repo can
deploy its backend and have it reachable on the tailnet at a stable HTTPS
`*.ts.net` name, **while the app repo holds zero Tailscale credentials.**

## 2. The platform / app boundary

You own everything foundational; the app owns everything specific to itself and
consumes your outputs via Pulumi stack references.

| Concern                                                         | **Riffstack (you)** |   App repo    |
| --------------------------------------------------------------- | :-----------------: | :-----------: |
| Tailscale ACL: tags, `tagOwners`, grants                        |         ✅          |       —       |
| Tailnet toggles: **MagicDNS + HTTPS certificates**              |         ✅          |       —       |
| Tailscale **Kubernetes operator** + its scoped OAuth client     |         ✅          |       —       |
| k3s **StorageClass** for the backend's PVC                      |         ✅          |       —       |
| **Namespace** for the app                                       |         ✅          |       —       |
| Pulumi **stack outputs** (the seam — see §4)                    |         ✅          |   consumes    |
| Backend `Deployment` / `Service` / `Ingress` / `PVC` / `Secret` |          —          |      ✅       |
| The `tailscale` `Ingress` that requests exposure                |          —          | ✅ (no creds) |
| Docker image build + push to Forgejo registry                   |          —          |      ✅       |

**Key design point:** the app requests tailnet exposure _declaratively_ — it
creates a Kubernetes `Ingress` with `ingressClassName: tailscale`. Your operator
(holding the scoped OAuth client) fulfils it. No Tailscale API token ever enters
the app stack. The only cross-repo coupling is that your **ACL must own the tag
the app's Ingress requests and grant the user's devices access to it** (§4.3).

## 3. Deliverables

### 3.1 Tailscale Kubernetes operator

Install the operator into the k3s cluster (Helm release via the Pulumi
Kubernetes provider, or manifests). It needs a **Tailscale OAuth client** with:

- scopes **`devices:core`** (read/write) **+** `auth_keys` (write),
- **restricted to the tag `tag:k8s-operator`**.

The operator registers itself as a tailnet node tagged `tag:k8s-operator` and
provisions ingress-proxy nodes on demand. Store the OAuth client id/secret in
1Password and inject via Pulumi (you already wire Pulumi → 1Password).

> **Gotcha (real, current):** Tailscale OAuth tag-restriction has live bugs —
> tags dropped on client creation, or a minted token carrying _all_ the client's
> tags (tailscale/tailscale #10702, #19945). Mitigation: **one OAuth client per
> consumer, each with a single tag.** Don't reuse this operator client for
> anything else.

### 3.2 Tailnet toggles (enable once)

- **MagicDNS** — on.
- **HTTPS Certificates** — on. This is what lets the operator's Ingress serve a
  valid `*.ts.net` certificate, which the **iPhone PWA requires** (service
  workers need a real secure context). These are tailnet-account settings; set
  via the Tailscale provider if supported, otherwise document them as a manual
  prerequisite in the stack README.

### 3.3 Tailscale ACL (policy file)

Manage the ACL as code (Tailscale Pulumi provider). It must:

- declare the tags and their ownership so the operator may tag its proxies, and
- grant the user's own devices (iPhone + MacBook, i.e. `autogroup:member` /
  `autogroup:owner`) access to the app's service tag **on 443 only**.

Concrete starting point (adjust names to taste, but keep them in sync with §4):

```jsonc
{
  "tagOwners": {
    "tag:k8s-operator": [], // the operator's own identity
    "tag:svc-dashboard": ["tag:k8s-operator"], // operator may tag proxies with it
  },
  "grants": [
    {
      "src": ["autogroup:member"], // the user's iPhone + MacBook
      "dst": ["tag:svc-dashboard"],
      "ip": ["443"], // HTTPS only; nothing else exposed
    },
  ],
}
```

One grant covers both the phone (reading the PWA) and the Mac (the local agent
POSTs to the backend over the same tailnet HTTPS endpoint) — both are the user's
own devices. If you prefer a reusable pattern, make the tag a family
(`tag:svc-*`) and grant it once so future services need no ACL edit.

### 3.4 k3s storage + namespace

- Ensure a **StorageClass** usable for a `ReadWriteOnce` PVC. k3s ships Rancher's
  **`local-path`** as default — that is sufficient; you need only confirm/expose
  its name. (It is node-local: no redundancy. Backups are **deferred** — there is
  no critical data yet. If the cluster is multi-node, note that the app must pin
  its pod with node affinity; surface the node name if relevant.)
- Create the **namespace** the app deploys into.
- The Forgejo registry has a **public cert**, so k3s/containerd pulls it with a
  standard `imagePullSecret` — **no `registries.yaml` CA work needed.** The pull
  secret itself is app-owned (its registry robot token); you only provide the
  namespace it goes in.

## 4. Interface contract — the seam (get these names exactly right)

### 4.1 Pulumi stack outputs (the app reads these via a stack reference)

Export these outputs from the Riffstack stack. Names and types are the contract;
the app repo hard-codes them.

| Output name     | Type   | Example               | Meaning                                                                         |
| --------------- | ------ | --------------------- | ------------------------------------------------------------------------------- |
| `namespace`     | string | `dashboard`           | k8s namespace the app deploys into                                              |
| `tailnetDomain` | string | `tailXXeta.ts.net`    | MagicDNS domain; app's URL is `https://dashboard.<tailnetDomain>`               |
| `serviceTag`    | string | `tag:svc-dashboard`   | the tag the app's Ingress must request; your ACL grants user devices → this tag |
| `storageClass`  | string | `local-path`          | StorageClass for the backend PVC                                                |
| `registryHost`  | string | `forgejo.example.com` | Forgejo registry host (for image refs + pull secret)                            |

### 4.2 What the app will emit (so your operator + ACL match it)

The app creates a Kubernetes **Ingress** in `<namespace>` like this (the exact
annotations you must support):

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: dashboard
  namespace: dashboard # = stack output `namespace`
  annotations:
    tailscale.com/hostname: "dashboard" # → dashboard.<tailnetDomain>
    tailscale.com/tags: "tag:svc-dashboard" # = stack output `serviceTag`
spec:
  ingressClassName: tailscale # provided by YOUR operator
  defaultBackend:
    service:
      name: dashboard-backend # app's ClusterIP Service
      port: { number: 80 }
  tls:
    - hosts: ["dashboard"] # triggers the ts.net cert
```

For this to work, your side must guarantee: the `tailscale` `IngressClass`
exists (operator), `tag:svc-dashboard` is owned by `tag:k8s-operator` (so the
operator may tag the proxy), HTTPS certs are enabled, and the ACL grants the
user's devices → `tag:svc-dashboard:443`.

### 4.3 The backend the Ingress points at (app-owned; for your awareness only)

- A single-replica `Deployment` (`strategy: Recreate`) — it holds a SQLite file
  **and** a long-lived JMAP push stream, so it must never run two pods. It mounts
  a `ReadWriteOnce` PVC (using `storageClass`) for the DB file.
- A `ClusterIP` Service `dashboard-backend` forwarding to the container.
- The container serves `/health` (→ 204, for probes), the tRPC API under `/api`,
  and the built SPA at `/`. It listens on a loopback-style HTTP port internally;
  no TLS in the pod — the Tailscale Ingress terminates TLS.

You do not deploy any of this; it's here so the Ingress target and the health
path are unambiguous.

## 5. Secrets

Everything sensitive comes from **1Password via Pulumi** (your existing
`secretspec` + Pulumi + 1Password setup). For this work that means exactly one
secret you own: the **operator's OAuth client id/secret**. The app's own secrets
(Fastmail/Toggl API tokens, the Forgejo robot token) are the app's concern and
never touch this repo. MoneyMoney (the most sensitive integration) runs only on
the user's Mac and never reaches the cluster at all.

## 6. Environment facts

- Cluster: **k3s**, `x86_64`, Linux. Default StorageClass `local-path`.
- Registry: **Forgejo** built-in OCI registry, **public cert**.
- Clients: iPhone (Tailscale iOS app; installable PWA) + MacBook (Tailscale
  macOS; runs the local agent). Both are the user's own tailnet devices.
- Single user — no multi-tenancy, no fan-out, no per-user auth.

## 7. Acceptance criteria

You are done when:

1. The operator node appears in the tailnet admin console tagged
   `tag:k8s-operator`, and a `tailscale` `IngressClass` exists in the cluster.
2. The ACL is applied: `tag:svc-dashboard` is owned by `tag:k8s-operator`, and a
   grant allows the user's devices → `tag:svc-dashboard:443`.
3. MagicDNS + HTTPS certificates are enabled on the tailnet.
4. The `namespace` exists and the `storageClass` is confirmed usable for a RWO
   PVC.
5. All five **stack outputs** (§4.1) are exported with the exact names/types.
6. **End-to-end smoke test** (once the app is deployed against these outputs):
   from the user's phone with Tailscale active,
   `https://dashboard.<tailnetDomain>/health` returns **204** with a **valid
   certificate** — and the same URL is unreachable with Tailscale off.

## 8. Open questions to confirm with the user before/while building

- **Exact names:** confirm `namespace`, the service tag (`tag:svc-dashboard`?),
  and the hostname (`dashboard`?). These must match on both sides.
- **HTTPS/MagicDNS:** are these already enabled on the tailnet, or does this work
  enable them?
- **PVC ownership:** app-created (recommended — it declares its own volume) vs.
  platform-provisioned. Default: app-created; you just supply `storageClass`.
- **Cluster shape:** single-node or multi-node k3s? (Decides whether the app
  needs node affinity for the node-local PVC.)
- **Is Forgejo on the same host as k3s?** (Affects only image push locality, not
  this repo — informational.)
