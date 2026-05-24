# 10 — Railway + Arc Testnet Go-Live Playbook (Circle-ready)

> Use this as the exact execution plan to get the project fully live on Arc testnet and submission-ready today.

## Goal

By the end of this runbook, you will have:
1. A live Railway URL serving the dashboard/API.
2. Contracts deployed on Arc testnet.
3. Agent wallets funded and forecasting continuously.
4. ERC-8004 agent registrations + reputation updates happening on-chain.
5. Optional Circle Programmable Wallet integration enabled (for rubric points).

---

## Fastest path decision (2 minutes)

Pick one mode before touching Railway variables:

- **Mode A — EOA mode (fastest, least risk):**
  - No `CIRCLE_*` variables.
  - Best if deadline is close and you need guaranteed go-live quickly.
- **Mode B — Circle mode (rubric-complete):**
  - Requires `CIRCLE_API_KEY` + `CIRCLE_ENTITY_SECRET`.
  - Use this when you can spend extra setup time and want explicit Circle wallet integration.

Recommendation for same-day submission:
1. Launch in **Mode A first** (prove end-to-end on Arc).
2. Then add Circle vars and switch to **Mode B**.

---

## Prerequisites checklist

- GitHub repo contains latest `main` branch.
- Railway account + project created.
- Arc faucet access: https://faucet.circle.com
- Arc RPC: `https://rpc.testnet.arc.network`
- Arc explorer: https://testnet.arcscan.app

If using Circle mode:
- Circle Console account: https://console.circle.com
- Circle API key + Entity Secret (see `docs/08-circle-entity-secret-setup.md`).

---

## Phase 1 — Railway baseline deployment

### 1) Connect repo to Railway

1. Railway → **New Project** → **Deploy from GitHub repo**.
2. Select this repository.
3. Confirm Railway uses the included `Dockerfile`.

### 2) Add persistent storage (required)

1. Service → **Settings** → **Volumes** → **New Volume**.
2. Mount path: **`/data`**.
3. Save.

Why: `/data` stores deployment + wallet state so restarts do not force re-funding/re-registration.

### 3) Set minimum variables

In Railway **Variables**:

| Variable | Value |
|---|---|
| `RPC_URL` | `https://rpc.testnet.arc.network` |
| `FLEET_SIZE` | `3` |
| `HORIZON_SEC` | `30` |
| `ROUND_GAP_SEC` | `15` |
| `APP_NAME` | `Forecast Arena` |
| `GEMINI_API_KEY` | optional |

Leave `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` unset for Mode A.

---

## Phase 2 — Go live on Arc (Mode A: no Circle)

### 4) Trigger deploy and watch logs

After saving variables, Railway redeploys. Watch service logs.

Find the line that asks you to fund the deployer wallet (or equivalent deployer address log).

### 5) Fund deployer on Arc faucet

1. Open https://faucet.circle.com
2. Choose **Arc testnet**.
3. Paste deployer address from Railway logs.
4. Request testnet USDC.

Suggested amount: **10 USDC** minimum.

### 6) Confirm automatic boot sequence

After funding, logs should show this flow:
1. Contract deployment complete.
2. Agent wallets created or loaded from `/data`.
3. Agent funding transfers.
4. ERC-8004 registrations.
5. Repeating round lifecycle: open → submit forecasts → settle.

---

## Phase 3 — Optional Circle enablement (Mode B)

### 7) Prepare Circle credentials

Follow `docs/08-circle-entity-secret-setup.md` to:
1. Create/obtain `CIRCLE_API_KEY`.
2. Generate + register `CIRCLE_ENTITY_SECRET`.
3. Keep recovery file safe.

### 8) Set Circle variables in Railway

Add:

| Variable | Value |
|---|---|
| `CIRCLE_API_KEY` | `TEST_API_KEY:...` |
| `CIRCLE_ENTITY_SECRET` | `<64-hex-chars>` |

Save variables and let Railway redeploy.

### 9) Fund Circle agent wallets

When logs print Circle wallet addresses, fund each on Arc faucet.

Then confirm rounds are still opening/settling with Circle-backed agents.

---

## Phase 4 — Submission evidence capture

Collect these artifacts for hackathon submission:

1. **Live Railway URL** (dashboard reachable).
2. **ArcScan links**:
   - contract deployment tx(s)
   - at least one round open tx
   - at least one settle tx
   - at least one reputation update / agent registration tx
3. **Screenshot** of live leaderboard with active rounds.
4. **Short demo video** (60–120s):
   - show Railway logs
   - show dashboard updating
   - show ArcScan tx confirmation
5. **Architecture notes** linking Circle + Arc + ERC-8004 usage.

---

## Smoke-test checklist (copy/paste)

- [ ] Railway service is green and continuously running.
- [ ] `/data` volume attached.
- [ ] `RPC_URL` points to Arc testnet.
- [ ] Deployer funded with Arc faucet USDC.
- [ ] Contracts deployed successfully.
- [ ] At least 3 agents registered.
- [ ] At least 1 round settled.
- [ ] Leaderboard updates in dashboard.
- [ ] ArcScan confirms recent txs.
- [ ] (Optional) Circle credentials active and wallets operating.

---

## Common failure fixes

- **Stuck before deployment:** deployer unfunded → fund and wait 30–90 seconds.
- **Re-registering/re-deploying every restart:** missing `/data` volume.
- **Circle UNAUTHORIZED:** invalid/missing `CIRCLE_ENTITY_SECRET` or wrong API key.
- **No round progression:** check `HORIZON_SEC`/`ROUND_GAP_SEC` not set too high.
- **No AI reasoning text:** missing `GEMINI_API_KEY`; heuristics still work.

---

## Recommended submission timeline (today)

- **T+0 to T+30 min:** Mode A deploy + faucet + verify 1 settled round.
- **T+30 to T+60 min:** Capture screenshots/video + ArcScan links.
- **T+60 to T+90 min:** Enable Circle (Mode B), verify wallet activity.
- **T+90 to T+120 min:** Final README/submission polish and submit.

If Circle setup delays you, submit with verified Mode A evidence first, then append Circle proof when live.
