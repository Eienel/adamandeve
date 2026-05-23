# 08 — Circle Entity Secret Setup (Arc Deployment)

> Step-by-step guide to set up Circle Programmable Wallets and deploy agents to Arc testnet.

## What is Entity Secret?

An **Entity Secret** is a cryptographic key issued by Circle that authorizes your application to create and manage **Programmable Wallets** (MPC-secured, gas-free wallets on Arc). Without it, agent wallet creation fails with `UNAUTHORIZED` or similar.

## Prerequisites

1. **Circle Account** at https://console.circle.com
2. **Arc testnet account** with a small amount of USDC for gas (~10 USDC). Faucet: https://faucet.circle.com
3. **Programmatic Access:** Circle API Key + Entity Secret (generated in the dashboard)
4. **RPC_URL** set to Arc testnet: `https://rpc.testnet.arc.network`

## Step 1: Generate Circle API Key & Entity Secret

1. Log in to **https://console.circle.com**.
2. Navigate to **API Keys** (Developers → API Keys).
3. Click **Create New Key**.
4. Choose **Testnet** scope and **Full Access** permissions.
5. Copy the **API Key** (looks like `pk_test_...`).
6. **IMPORTANT:** Copy the **Entity Secret** displayed once at creation (it is shown only once and cannot be recovered).
   - Store safely; you'll need it in `.env`.

## Step 2: Update .env

```bash
cp .env.example .env
```

Edit `.env` and add:

```env
# Arc testnet (replacing local anvil)
RPC_URL=https://rpc.testnet.arc.network

# Deployer account (must be funded at https://faucet.circle.com; ~10 USDC for gas)
DEPLOYER_PRIVATE_KEY=0x<your-account-private-key>

# Circle Programmable Wallets
CIRCLE_API_KEY=pk_test_...
CIRCLE_ENTITY_SECRET=<your-entity-secret-from-console>

# (Optional) Gemini or Claude for agent reasoning
GEMINI_API_KEY=<your-api-key>  # or ANTHROPIC_API_KEY for direct Claude
GEMINI_MODEL=gemini-2.5-flash
```

**NEVER commit `.env` or leak the Entity Secret.**

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
