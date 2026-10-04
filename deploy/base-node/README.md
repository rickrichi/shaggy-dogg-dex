# Own Base node

Hardened compose for `ghcr.io/base/node` (from the current `base/base` repo, image pinned to v1.4.2).
Differences from upstream: RPC/WebSocket/metrics bind to **127.0.0.1 only**; engine JWT is generated
per install (upstream ships a public one). Only P2P ports 30303 and 9222 are public.

## Before you start (blockers on this workstation, checked 2026-10-03)
- **Disk:** C: has ~74 GB free (92% used). A Base node needs far more (snapshot + growth, NVMe).
  Use a dedicated disk/host and set `HOST_DATA_DIR`. Check Base's current size guidance first.
- **L1 endpoints:** you need Ethereum L1 execution RPC + beacon API (own L1 node or a paid provider).
- **Node type:** decide pruned vs archive/full and Flashblocks now; it cannot change after first sync.
- A home PC is a poor host (uptime, upload bandwidth, sleep). A VPS/bare metal is better.

## Steps
1. `powershell -File init.ps1` – creates gitignored `.env.node` with a fresh JWT.
2. Edit `.env.node`: set `BASE_NODE_L1_ETH_RPC`, `BASE_NODE_L1_BEACON`; optional pruning/Flashblocks.
3. Optionally restore a Base snapshot into `HOST_DATA_DIR` (see docs.base.org run-a-base-node) to skip days of sync.
4. `docker compose up -d` (from this folder); `docker compose logs -f`.
5. `powershell -File check-node.ps1` until it reports `syncing=no`.
6. Point the gateway at it: `SHAGGY_RPC_UPSTREAM=http://127.0.0.1:8545`, restart, check
   `/health/ready` and an authenticated read (see docs/shaggy-rpc.md).

Never commit `.env.node` or `reth-data/` (both gitignored). Firewall: allow inbound 30303 and 9222
(TCP+UDP) only; never expose 8545/8546/7545.

## Extras
- `preflight.ps1 -RequiredFreeGB <n>` – checks disk, L1 endpoints (chain 1), JWT, Docker. Run before step 4.
- Monitoring: `echo <password> > .grafana-admin` (gitignored) then `docker compose --profile monitoring up -d`
  (Prometheus :9090, Grafana :3001, loopback only). Confirm the execution metrics path on the running image.
- Public HTTPS: `--profile public` runs Caddy in front of the gateway (edit `Caddyfile` domain; Linux host only).
  Expose only the gateway, never the node ports.
- Gateway transaction submission is opt-in: `SHAGGY_RPC_ALLOW_SEND=true` (own node only; not private routing).
- See `profiles.md` for pruning/Flashblocks choices.
