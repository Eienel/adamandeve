# 02 — Architecture

> Reflects the halal hybrid model (see `01-decisions.md`). Components and data flow.

## Components

```
                         Arc L1 (EVM, USDC = native gas)
   Resolver/Backend ─►  ForecastRegistry · PrizeVault · SignalsMarket · MiniAMM · ManagedVault(stretch)
   (Node/TS service)    events: RoundOpened / ForecastCommitted / RoundScored / TraceUnlocked / Traded
        │ ▲                       │
   price feed (Pyth/CEX REST)     └─► indexer (viem logs) ─► Postgres + Blob (full reasoning text)
        ▼
   Round Engine: openRound → (collect forecasts) → fetch/observe truth → score accuracy
        │ REST/WS
        ▼
   Agent Fleet (Claude Agent SDK); each agent ↔ one Circle Programmable (MPC) wallet
        │
   Open Join API/SDK (register, get round, submit forecast, buy signal)
        │
   Dashboard (Next.js): leaderboard, round viewer, traction counters, signal/reasoning purchase
```

## Core flow (intelligence + competition layers — the MVP)
1. Resolver `openRound(mode, closeTs)` → `RoundOpened`.
2. Each agent reasons via Claude SDK → `{priceForecast, reasoning}`. Stores full reasoning off-chain; gets `traceHash = keccak256(reasoning)`.
3. Agent submits `submitForecast(roundId, priceForecast, traceHash)` — **free entry**; emits `ForecastCommitted(roundId, agent, traceHash)` (**hash only — never the forecast value**, so others can't copy: honors "no idea what other agent did").
4. At `closeTs`, resolver determines truth: SPOT = price feed at close; TRADE = real MiniAMM swap execution price (trustless). Calls `score(roundId, truthPrice)` → ranks by `|forecast − truth|`, updates each agent's accuracy/reputation; emits `RoundScored`.
5. **Competition:** periodically, `PrizeVault` distributes treasury/sponsor-funded prizes to top-ranked agents (juʿāla). No participant money is pooled into prizes.
6. **Marketplace:** anyone can `buySignal/payToReadTrace` — pays a micro-fee (Nanopayment) → `TraceUnlocked` → backend releases the agent's reasoning/forecast. Revenue → producing agent minus a small platform commission. (ijāra)

## Managed-trading flow (stretch — muḍāraba)
- Depositor deposits USDC into `ManagedVault` and assigns an agent (mudarib).
- Agent makes **real spot swaps** on MiniAMM (no leverage). Realized profit shared per agreed ratio; capital bears loss (muḍāraba). On-chain accounting.

## Submission privacy (anti-copy)
- High-frequency rounds: store forecast on-chain but **never emit it**; API/dashboard hide live forecasts until close.
- Flagship rounds: flip a per-round flag to true **commit-reveal** (`commit(hash)` → `reveal(value, salt)`) for provable copy-resistance without doubling tx count on every round.

## Reasoning provenance
- `traceHash` anchored at submission time proves the agent reasoned **before** the outcome. Full text off-chain (Postgres/Blob), hash on-chain. The marketplace sells access to this verifiable reasoning.

## Stack
- Contracts: Solidity + Foundry on Arc testnet. Reuse Arc samples (arc-escrow custody, arc-p2p-payments USDC flows) and Uniswap-v2-lite for MiniAMM.
- Backend/resolver + indexer: Node/TS (viem) + Postgres + Blob.
- Agents: Claude Agent SDK; Circle developer-controlled wallets (`@circle-fin/developer-controlled-wallets`).
- Open API/SDK: FastAPI or Express + a thin TS/Python client SDK.
- Dashboard: Next.js (App Router) + wagmi/viem + Tailwind; deploy on Vercel.

## How each layer scores
- **Agentic (30%):** autonomous forecasting + autonomous real-spot trading agents; adaptive behavior round-to-round.
- **Traction (30%):** forecast submissions, signal purchases, and trades are all real on-chain txns; open arena brings third-party agents + consumers. Paid usage is strong evidence of "real volume".
- **Circle (20%):** Programmable Wallets (every agent + user) + Nanopayments (signal micro-payments) + USDC on Arc.
- **Innovation (20%):** on-chain marketplace for verifiable, provenance-anchored agent intelligence + a skill competition + real managed trading.
</content>
