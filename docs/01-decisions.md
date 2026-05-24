# 01 — Decisions Log (append-only)

> Newest entries at the bottom of each section. Record *what* we decided and *why*. Do not rewrite history; add corrections as new entries.

## Project identity
- **Name: REDACTED for now** (user request). Build under a neutral placeholder. Wire the display name to a single constant `APP_NAME` (one config file) so the real name can be dropped in with a one-line change. **No identifying name in commits, contracts, UI strings, or this repo.**

## Concept (current)
An **open marketplace where autonomous AI agents produce verifiable market intelligence (forecasts + reasoning)**, settled on Arc in USDC. Three permissible economic layers (the "hybrid" model):
1. **Intelligence marketplace (ijāra / bayʿ of a service):** agents sell their forecasts + reasoning; consumers (humans or other agents) pay micro-payments (Circle Nanopayments) to access them. **This is the core revenue engine.**
2. **Skill competition (juʿāla / musābaqa):** the most *accurate* forecasters win prizes from a **treasury/sponsor-funded** pool — **never** from contestants' stakes. Entry is free.
3. **Real managed spot-trading (muḍāraba / wakāla):** smaller track — agents trade **real spot** assets (no leverage, immediate settlement) on our MiniAMM and earn a share of real profit.

Agents forecast a **price** (a number); two challenge modes share one engine:
- **spot-close:** predict a reference price (e.g. ETH/USDC) at round close via a feed (high-frequency volume).
- **trade-impact:** the platform fires a **real swap** on our MiniAMM; agents predict the resulting execution price (flagship; trustless truth).

## Decision journal

### 2026-05-22 — initial direction
- User's original idea (WhatsApp screenshot): a pool where agents predict a trade outcome; closest wins; losers refunded near-zero fees; winner gets refund + ~1% of LP. Endless game.
- Explored hackathon, Arc, Circle stack. Confirmed idea maps to RFB 02/03.
- Chose to **refine** the idea (vs. parimutuel or standalone arbitrage).
- Prediction target: **price**, two modes (spot-close + trade-impact) — user answered "1 and 3".
- Traction: **own fleet + open arena** (third parties can join) — biggest lever on the 30% traction score.
- **USYC dropped** (user). Lucky: it also removes a riba problem (see fiqh section).
- Added: **reasoning-trace as a product** and **arbitrage as an agent role** (user liked both).

### 2026-05-22 — halal restructuring (IMPORTANT)
- User asked whether the project is permissible under Islamic finance. Honest assessment: the **betting/fee-funded pool (losers' fees fund the winner) is maysir (gambling)** and had to be removed. USYC yield would have been **riba**. Perps/leverage = **gharar**.
- **Decision: adopt the "hybrid" halal model** (intelligence marketplace + competition + real managed trading), per the three layers above.
- **Sharia verification: best-effort for now.** Design conservatively to avoid riba/maysir/gharar; document rationale here; formal scholarly review deferred until after the hackathon. (Author is not a scholar; rulings vary by madhhab/scholar.)
- Branding: **no "halal"/Islamic labels** anywhere in the repo or product — substance only.

### 2026-05-22 — build on Arc's native agentic-economy standards
- The synced `arc-canteen context` revealed Arc has DEPLOYED standards on testnet: **ERC-8004** (agent identity + reputation + validation registries) and **ERC-8183** (job lifecycle with USDC escrow settlement), plus **x402 + Nanopayments** for paid resources. See `04-circle-arc-refs.md` for addresses/ABIs.
- **Decision: build ON these instead of inventing equivalents.**
  - Agent identity + reputation → ERC-8004 (our forecast accuracy → on-chain reputation; our arena contract is the neutral attestor, which satisfies ERC-8004's non-self-dealing rule since it is not the agent owner).
  - Selling intelligence / managed work → ERC-8183 jobs (escrowed USDC, deliverable hash = forecast/reasoning provenance) and/or x402 for lightweight pay-per-read.
  - Our custom Solidity is now thin: a **ForecastArena** competition engine (rounds, free forecast submission with traceHash provenance, on-chain settlement + ranking, reputation push to ERC-8004), a **MiniAMM** (trade-impact + managed-trading venue), and a **PrizePool** (juʿāla, externally funded).
- Big win for scoring: using bleeding-edge ERC-8004/8183 + x402 strengthens Circle/Arc tool usage (20%) and innovation (20%), and reputation/identity strengthen agentic (30%).
- Tooling note: Foundry installed by downloading the release binary directly (api.github.com is blocked here so `foundryup` can't resolve tags). forge 1.5.1.

### 2026-05-23 — build status (Day 1 shipped)
- **Contracts (Foundry, 24 tests passing):** `ForecastArena` (free-entry rounds, hidden-value
  anti-copy + traceHash provenance, on-chain settlement/ranking, reputation push to ERC-8004),
  `MiniAMM` (spot AMM for trade-impact truth + managed trading), `PrizePool` (ju'ala, externally
  funded). ERC-8004 used via interfaces; ERC-8183 wired for the paid-service track.
- **Off-chain (TS pnpm workspace, typechecks clean):** `packages/shared` (chains/abis/clients/store),
  `apps/agents` (heuristic + optional Claude strategies, ERC-8004 self-register, Circle Programmable
  Wallet path for Arc), `apps/resolver` (price feed + round engine), `apps/api` (dashboard + x402
  pay-to-read signals marketplace).
- **Verified locally end-to-end on anvil:** agents register on ERC-8004 → forecast → settle →
  reputation on-chain → real AMM swap; dashboard + x402 402→pay→reveal flow all working. One command: `pnpm demo:local`.
- **Not yet run (needs keys/funding):** live Arc deployment, Circle MPC wallet creation/funding
  (faucet), Claude-backed reasoning. All code paths are wired and typecheck.
- **Naming:** still redacted; `APP_NAME` placeholder = "Forecast Arena" (descriptive working title, not a brand).

### 2026-05-23 — deployment + model provider
- **Hosting: Railway** (user choice; no PC access, deploy-from-GitHub). Railway runs long-lived
  processes, so chain + agents + resolver + dashboard fit in ONE service via `Dockerfile` running
  `scripts/serve.ts`. (Vercel rejected: serverless can't host the 24/7 agent/resolver loop.)
- **Model provider: AWS Bedrock supported** in addition to a direct Anthropic key. User's Bedrock
  key was verified valid (auth + Claude model access OK) but is currently daily-token-quota limited
  (HTTP 429) — resolves by enabling billing on the AWS account or waiting for the daily reset.
  Agents fall back to heuristics on any quota/throttle/error, so the demo always runs.
- **Security note:** the Bedrock API key was pasted into chat → advised the user to rotate it.

## Fiqh rationale (economic-design constraints — keep these true)
Avoid the three prohibitions:
- **Riba (interest):** no predetermined return on money; no interest-bearing yield (no USYC/treasury yield) funding anything.
- **Maysir / qimar (gambling):** no contract where participants stake money into a pot and the winner takes the losers' stakes on an uncertain outcome. → **Competition entry is FREE; prizes come from treasury/sponsor, not from participants. Fees only ever flow as payment for a genuine service (intelligence) or as a platform commission on such a service.**
- **Gharar (excessive uncertainty):** no leverage, perps, options, or short-selling. Real trading is **spot only**, immediate settlement, permissible assets.
Permissible structures we rely on: **ijāra/bayʿ** (selling a service), **juʿāla/musābaqa** (third-party prize for a task/skill), **muḍāraba/wakāla** (profit-share on real managed capital), **brokerage/wakāla commission** (platform fee on a real sale).

### 2026-05-23 — Arc testnet + Circle Entity Secret (deployment confirmed)
- **Arc RPC:** https://rpc.testnet.arc.network (public, no auth; USDC = native gas, 6 decimals).
- **Circle Programmable Wallets:** created via Entity Secret (one-time setup in Circle console). Wallets are MPC-secured, gas-free, and sign txs server-side. Per-agent wallet = one forecaster identity on-chain.
- **Two-step bootstrap:** (1) create wallets via Circle API; (2) fund at faucet; (3) register agents on ERC-8004 identity registry.
- **Deployment flow:** deploy contracts → bootstrap wallets → run agents → submit live predictions → settle on-chain → agents' reputation updates.
- See `docs/08-circle-entity-secret-setup.md` for step-by-step guide (requires manual Circle console access).

## Out of scope (by decision)
- USYC / any yield product (riba).
- Betting pools / parimutuel / winner-takes-stakes (maysir).
- Perps, leverage, options, shorts (gharar). Avoid RFB 01.
</content>
