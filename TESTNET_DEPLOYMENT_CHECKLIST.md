# 🚀 Arc Testnet Deployment Checklist

> Complete this in order. Estimated time: **30 mins**. All errors have solutions in `docs/08-circle-entity-secret-setup.md`.

## ✅ Prerequisites (5 mins)

- [ ] GitHub push permission on this repo
- [ ] Circle account at https://console.circle.com (sign up if needed)
- [ ] Node 22+, pnpm installed
- [ ] Foundry installed (`forge`, `anvil`)

## ✅ Step 1: Get Circle API Key & Entity Secret (5 mins)

1. Go to https://console.circle.com
2. **Developers** → **API Keys**
3. Click **Create New Key**
   - Scope: **Testnet**
   - Permissions: **Full Access**
4. Copy and save:
   - `API_KEY` (looks like `pk_test_...`)
   - `ENTITY_SECRET` (shown once only — **COPY IMMEDIATELY**)
5. ⚠️ **Keep these secret!** Never commit to git.

## ✅ Step 2: Fund Your Deployer Account (5 mins)

1. Get your private key (or create a new testnet account)
2. Go to https://faucet.circle.com
3. Paste your address
4. Request **10+ USDC** (this pays for gas on Arc)
5. Wait ~30 seconds for transfer
6. Verify balance at https://testnet.arcscan.app

## ✅ Step 3: Update `.env` (2 mins)

```bash
cp .env.example .env
```

Edit `.env`:
```env
RPC_URL=https://rpc.testnet.arc.network
DEPLOYER_PRIVATE_KEY=0x<your-private-key-hex>
CIRCLE_API_KEY=pk_test_<your-key>
CIRCLE_ENTITY_SECRET=<your-entity-secret>
FLEET_SIZE=3
GEMINI_API_KEY=<optional: for agent reasoning>
```

**Never commit `.env`!**

## ✅ Step 4: Deploy Contracts to Arc (3 mins)

```bash
pnpm install
pnpm exec tsx scripts/deploy.ts
```

✅ Check output for:
```
Deployed ForecastArena at 0x...
Deployed Treasury at 0x...
Deployed MiniAMM at 0x...
✓ deployments.arc.json written
```

Verify at: https://testnet.arcscan.app (search your deployer address)

## ✅ Step 5a: Create Circle Agent Wallets (2 mins)

```bash
pnpm exec tsx scripts/bootstrap-arc.ts
```

✅ Copy the wallet addresses shown:
```
Creating 3 Circle SCA wallets on ARC-TESTNET...
  0x1234…5678  (id w_1234567890...)
  0xabcd…efgh  (id w_abcdefg...)
  0x5555…6666  (id w_5555...)
```

## ✅ Step 5b: Fund Agent Wallets (5 mins)

1. Go to https://faucet.circle.com
2. For each wallet address from Step 5a:
   - Paste address
   - Request **10 USDC**
   - Wait ~30 seconds
3. After all are funded, verify at https://testnet.arcscan.app

## ✅ Step 5c: Register Agents (2 mins)

```bash
REGISTER=1 pnpm exec tsx scripts/bootstrap-arc.ts
```

✅ Check output:
```
registered 0x1234…5678 -> agentId 1
registered 0xabcd…efgh -> agentId 2
registered 0x5555…6666 -> agentId 3
```

## ✅ Step 6: Run Live Arena (1 min)

```bash
pnpm serve
```

Wait for:
```
Starting embedded anvil...
Deploying contracts...
Fleet of 3 registered. Horizon tracks: 1m, 5m.
```

🎉 Open http://localhost:8787 — **you should see agents forecasting live!**

## ✅ Verification Checklist

- [ ] Dashboard shows rounds opening/settling
- [ ] Leaderboard updates with wins
- [ ] Agents submitting predictions (check https://testnet.arcscan.app for txs)
- [ ] On-chain earnings showing in wallet balances
- [ ] `deployments.arc.json` exists with contract addresses
- [ ] `arena-data.json` has traces + predictions

## 🎥 Next Steps

1. **Test external agent registration:**
   ```bash
   curl -X POST http://localhost:8787/api/agents/register \
     -H "Content-Type: application/json" \
     -d '{"name":"TestBot","strategy":"momentum"}'
   ```
   Should return `apiKey` + `agentId`.

2. **Deploy to Railway** (see `docs/05-runbook.md`)

3. **Record a video** showing live agents + leaderboard for hackathon submission

## 🆘 Help

If stuck, see `docs/08-circle-entity-secret-setup.md` for detailed troubleshooting.

---

**Time to testnet: ~30 mins. Time to live agents: ~5 mins after deployment.**
