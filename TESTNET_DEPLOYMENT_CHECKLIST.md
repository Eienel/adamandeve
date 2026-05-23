# 🚀 Arc Testnet Deployment (Railway)

Two ways to go on-chain on Arc. **Path A (EOA) needs no Circle** and is the fastest from mobile.

---

## ⭐ Path A — EOA mode (no Circle, recommended)

Agents run as plain Arc wallets. The app auto-generates and persists every key; you just fund the
addresses it prints. No private keys to handle, no Circle Entity Secret.

### 1. Add a Railway Volume (so keys + deployment survive restarts)
- Railway service → **Settings** → **Volumes** → **New Volume**
- Mount path: **`/data`** → Save

### 2. Set Railway Variables
| Variable | Value |
|----------|-------|
| `RPC_URL` | `https://rpc.testnet.arc.network` |
| `FLEET_SIZE` | `3` |
| `GEMINI_API_KEY` | *(optional — agent reasoning; else heuristics)* |

> Do **not** set `DEPLOYER_PRIVATE_KEY` — on Arc the app generates a dedicated one for you.
> Do **not** set `CIRCLE_*` — leaving them unset selects EOA mode.

Save → Railway redeploys.

### 3. Fund ONE wallet (the deployer)
Open the Railway **deploy logs**. You'll see:
```
⏳ Fund ONLY this deployer wallet with ~10 testnet USDC (faucet: https://faucet.circle.com, select Arc testnet):
   DEPLOYER  0x....
   On Arc, gas IS USDC — the app then auto-sends USDC to each agent and starts forecasting:
     → agent 0x....  (momentum)
     → agent 0x....  (mean-reversion)
     → agent 0x....  (contrarian)
```
Go to https://faucet.circle.com → select **Arc testnet** → paste the **DEPLOYER** address → request USDC.

That's the only faucet step. On Arc the native gas token *is* USDC, so the app automatically:
1. Deploys the contracts (deployer pays gas),
2. Sends `AGENT_FUND_USDC` (default 2) USDC to each agent wallet,
3. Registers each agent on ERC-8004 and starts forecasting — no restart, no per-agent faucet.

> Tune `AGENT_FUND_USDC` to change the per-agent gas top-up.

### 4. Verify
- Dashboard (your Railway URL) shows rounds opening/settling on Arc.
- Logs show `Opened round … / settled — winner …`.
- Check txs at https://testnet.arcscan.app (search the deployer or an agent address).

That's it — you're fully on-chain on Arc. ✅

---

## Path B — Circle Programmable Wallets (gas-free MPC, optional)

Adds Circle to the build (worth 20% of the hackathon rubric). Requires a **fresh** Circle account
because the previous entity's secret + recovery file are lost (it's permanently locked).

1. Sign up at https://console.circle.com with a **new email**.
2. Create an API key (Developers → API Keys).
3. **Configurator** → **Generate Entity Secret** → **Register** → **download the recovery file**
   (save it this time!) and copy the entity secret value.
4. Railway Variables: add `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET` (plus `RPC_URL`, `/data` volume).
   With Circle creds present, the app uses Circle wallets instead of EOAs automatically.
5. Fund the Circle wallet addresses printed in the logs at the faucet.

Full detail: `docs/08-circle-entity-secret-setup.md`.

---

## Notes
- **Persistence:** all keys + the deployment live under `/data`. Keep the volume to avoid
  redeploying/re-funding on every restart.
- **Security:** generated keys never leave the volume and are gitignored. They're testnet-only.
- **Local dev:** `pnpm serve` with no env runs the embedded anvil demo (no keys, no funding).
