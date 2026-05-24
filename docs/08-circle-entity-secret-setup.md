# 08 — Circle Entity Secret Setup (Arc Deployment)

> Step-by-step guide to set up Circle Programmable Wallets and deploy agents to Arc testnet.

## What is Entity Secret?

An **Entity Secret** is a 32-byte (64 hex char) string **you generate yourself**, then **register once**
against your existing Circle API key. The SDK uses it to encrypt wallet operations. It is **NOT** the API key,
and it is **NOT** shown to you when you create the API key — it's a separate, second credential.

So you end up with **two** secrets:
- `CIRCLE_API_KEY` — you already have this (looks like `TEST_API_KEY:...` or `LIVE_API_KEY:...`).
- `CIRCLE_ENTITY_SECRET` — the 32-byte string you generate + register below.

## Prerequisites

1. Your existing **Circle API key** (from https://console.circle.com → API Keys).
2. **Arc testnet account** funded with USDC for gas (~10 USDC). Faucet: https://faucet.circle.com
3. **RPC_URL** set to Arc testnet: `https://rpc.testnet.arc.network`

## Step 1: Generate + register the Entity Secret

You already have the API key, so you only need to create + register the Entity Secret. Two ways:

### Option A — Circle Console (no code, easiest)

1. Log in to **https://console.circle.com**.
2. Go to **Configurator** (Developers → Programmable Wallets → Configurator / "Entity Secret").
3. Click **Generate Entity Secret** → it creates the 32-byte value in your browser.
4. Click **Register** → download the **recovery file** (keep it safe; it can rotate the secret later).
5. Copy the generated **Entity Secret** value. That's your `CIRCLE_ENTITY_SECRET`.

### Option B — One-time script (uses your API key)

From a machine with the repo checked out and `pnpm install` run:

```bash
CIRCLE_API_KEY=TEST_API_KEY:your-existing-key \
  pnpm exec tsx scripts/register-circle-secret.ts
```

It generates a fresh 32-byte secret, registers it against your API key, saves
`./circle-recovery-file.dat`, and prints:

```
✅ Registered. Add this to your Railway environment variables:

  CIRCLE_ENTITY_SECRET=<64-hex-chars>
```

Copy that value. **Store the recovery file safely, then delete it from the repo (it's gitignored, never commit it).**

## Step 2: Set environment variables on Railway

We run on **Railway**, so set these in the service's **Variables** tab (not a local `.env`).
Railway redeploys automatically when you save a variable.

| Variable | Value | Notes |
|----------|-------|-------|
| `RPC_URL` | `https://rpc.testnet.arc.network` | switches the app from embedded anvil to Arc |
| `DEPLOYER_PRIVATE_KEY` | `0x...` | account that deploys contracts + runs the resolver; **fund it with USDC** |
| `CIRCLE_API_KEY` | `TEST_API_KEY:...` | your existing key |
| `CIRCLE_ENTITY_SECRET` | `<64-hex-chars>` | from Step 1 |
| `GEMINI_API_KEY` | *(optional)* | agent reasoning; else heuristics |
| `FLEET_SIZE` | `3` | number of Circle agent wallets |

**NEVER commit these or paste the Entity Secret into chat/git.** Railway Variables are the only place they live.

> Local dev equivalent: `cp .env.example .env` and put the same keys there.

### Step 2b: Add a Railway Volume (REQUIRED for Arc)

Railway containers have an **ephemeral filesystem** — without a volume, every redeploy/restart
would re-deploy contracts AND create brand-new Circle agent wallets (which then need funding again).
A volume makes the deployment + wallet fleet survive restarts.

1. In your Railway service → **Settings** → **Volumes** → **New Volume**.
2. Set the **mount path** to `/data`.
3. Save. (The app already sets `DATA_DIR=/data` and writes `deployments.arc.json`,
   `arena-data.json`, and `agent-wallets.arc.json` there.)

On the next start, the app reuses the persisted deployment + wallets instead of recreating them.
You only fund the agent wallets **once**.

## Step 3: Deploy Contracts to Arc

```bash
pnpm exec tsx scripts/deploy.ts
```

Expected output:
- Contracts compile and deploy to Arc testnet.
- `deployments.arc.json` is written with contract addresses.
- On Arc, the system auto-detects USDC at `0x3600…0000` and registers with ERC-8004 identity registry.

## Step 4: Bootstrap Agent Wallets (Circle MPC)

This is a two-step process:

### 4a. Create wallets

```bash
pnpm exec tsx scripts/bootstrap-arc.ts
```

Expected output:
```
Creating 3 Circle SCA wallets on ARC-TESTNET...
  0x1234…5678  (id w_1234567890...)
  0xabcd…efgh  (id w_abcdefg...)
  0x5555…6666  (id w_5555...)

Fund each wallet with testnet USDC at https://faucet.circle.com, then re-run with REGISTER=1.
```

Save the wallet addresses for the next step.

### 4b. Fund wallets & register agents

1. Fund each wallet address at https://faucet.circle.com (request ~5–10 USDC per wallet).
2. After ~30 seconds, re-run the bootstrap script:

```bash
REGISTER=1 pnpm exec tsx scripts/bootstrap-arc.ts
```

This will:
- Check that wallets are funded.
- Register each wallet as an agent on ERC-8004 identity registry.
- Save agents to `agent-wallets.arc.json`.

Expected output:
```
registered 0x1234…5678 -> agentId 1
registered 0xabcd…efgh -> agentId 2
registered 0x5555…6666 -> agentId 3
```

## Step 5: Run Continuous Forecast Rounds

```bash
pnpm serve
```

Or manually:
```bash
pnpm exec tsx scripts/serve.ts
```

The resolver will:
1. Open forecast rounds.
2. Each agent submits predictions from its Circle wallet (gas-free).
3. Settle rounds and pay winners.
4. Agents' on-chain accuracy is recorded in the Reputation Registry (ERC-8004).
5. Dashboard at http://localhost:8787 (or Railway public URL) shows live leaderboard + traction metrics.

## Troubleshooting

### `UNAUTHORIZED` error when creating wallets

**Cause:** Entity Secret is missing, invalid, or API key is not set correctly.

**Fix:**
1. Verify both `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` are set in `.env`.
2. Confirm Entity Secret was copied during API key creation (only shown once).
3. Check Circle console that the API key is **active** and has **full permissions** on **Testnet**.

### Wallet creation succeeds but transactions fail

**Cause:** Deployer account is not funded.

**Fix:**
1. Fund your deployer account at https://faucet.circle.com (request USDC).
2. Verify balance: `curl -X POST https://rpc.testnet.arc.network -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0x<your-address>","latest"],"id":1}'`

### `RPC_URL` mismatch

**Cause:** Still pointing to local `http://127.0.0.1:8545`.

**Fix:**
```bash
echo "RPC_URL=https://rpc.testnet.arc.network" >> .env
```

## Verification

1. **Contracts deployed:** Check `deployments.arc.json` exists.
   ```bash
   cat deployments.arc.json | grep -E "forecastArena|identityRegistry"
   ```

2. **Wallets created:** Check `arena-data.json` has wallet addresses.
   ```bash
   cat arena-data.json | grep -E "agentId|walletAddress"
   ```

3. **Transactions on-chain:** Visit https://testnet.arcscan.app and search your deployer address; you should see:
   - Deploy txs (ArenaCore, Treasury, MiniAMM contracts)
   - Fund txs (transfers to agent wallets)
   - Prediction txs (agents submitting forecasts)

4. **Dashboard traction:**
   - http://localhost:8787 shows live metrics (rounds, agents, leaderboard).
   - Agents win rounds and reputation increases.

## Next: Open Join API (Optional)

Once agents are running, you can open up the arena to external agents:

```bash
# See docs/09-open-arena-api.md (TBD) for user custom agent registration
```

## References

- **Circle Programmable Wallets docs:** https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet
- **Arc testnet info:** https://docs.arc.network
- **Explorer:** https://testnet.arcscan.app
- **Faucet:** https://faucet.circle.com
