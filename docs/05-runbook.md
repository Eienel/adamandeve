# 05 — Runbook (setup & run)

> Verified working. Local end-to-end needs no API keys.

## 0. Prereqs
- Node 22+, pnpm, git, Foundry (`forge`, `anvil`).
- Foundry install note: in this environment `api.github.com` is blocked, so `foundryup` can't
  resolve release tags. Workaround used: download the release tarball directly —
  `curl -L https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_linux_amd64.tar.gz | tar xz -C ~/.foundry/bin forge cast anvil chisel`.
- Optional: `ANTHROPIC_API_KEY` (Claude-backed agent reasoning), Circle API key + entity secret
  (Programmable Wallets on Arc), `arc-canteen` CLI (Arc RPC + traction reporting).

## 1. Install
```bash
pnpm install
```

## 2. Local end-to-end demo (no keys)
```bash
pnpm demo:local     # starts anvil, builds + deploys, registers 3 agents on ERC-8004,
                    # runs 3 forecast rounds, settles, pushes reputation, does a real AMM swap
pnpm api            # dashboard + API at http://localhost:8787 (keep the demo's anvil running)
```
Tunables (env): `FLEET_SIZE` (default 3), `ROUNDS` (3), `HORIZON_SEC` (8), `APP_NAME`.

Manual equivalent:
```bash
anvil --silent &
export RPC_URL=http://127.0.0.1:8545 \
  DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
(cd contracts && forge build)
pnpm exec tsx scripts/deploy.ts       # writes deployments.local.json
pnpm exec tsx scripts/local-demo.ts
pnpm exec tsx apps/api/src/index.ts
```

## 3. Contracts
```bash
cd contracts && forge build && forge test    # 24 tests
```

## 4. Typecheck
```bash
for p in packages/shared apps/agents apps/resolver apps/api; do pnpm exec tsc --noEmit -p $p/tsconfig.json; done
```

## 5. Deploy to Arc testnet
```bash
cp .env.example .env   # set DEPLOYER_PRIVATE_KEY; fund it at https://faucet.circle.com
RPC_URL=https://rpc.testnet.arc.network pnpm exec tsx scripts/deploy.ts
# On Arc this auto-uses real USDC (0x3600…0000) + ERC-8004 registries.
```

## 6. Arc CLI (RPC + traction reporting)
```bash
uv tool install git+https://github.com/the-canteen-dev/ARC-cli
arc-canteen login            # GitHub device flow (interactive)
arc-canteen context sync     # docs + samples -> ~/.arc-canteen/context
arc-canteen update-traction  # report during the event window
```

## Notes
- Secrets stay out of git (`.env`, Circle entity secret). `deployments.local.json` + `arena-data.json` are gitignored.
- Develop/commit/push on branch `claude/arc-circle-hackathon-4slm0`.
- Agents run with deterministic heuristics when `ANTHROPIC_API_KEY` is unset, so the demo always runs.
