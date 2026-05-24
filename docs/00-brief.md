# 00 — Hackathon Brief

> Single source of truth for the event. If you're a new model/session, read this first, then `01-decisions.md`.

## Event
- **Name:** Agora Agents Hackathon
- **Host / sponsors:** Canteen (organizer) × Circle (NYSE: CRCL) × Arc
- **Theme:** "Where AI agents make markets" — autonomous agents that trade, invest, create, and interface with markets, settled on **Arc** with **USDC**.
- **Format:** 2 weeks, online. **May 11 → May 25, 2026.** Submission deadline **May 25**.
- **Prize pool:** $50,000 total (grand prizes $40k; standout teams $7.5k; feedback $500; easter eggs $2k).

## Judging (equally weighted)
- **30% Agentic sophistication** — genuine autonomous decision-making (full autonomy prioritized over automation).
- **30% Traction** — real users, real transactions, real volume **during the event window**.
- **20% Circle tool usage** — creative use of Wallets, CCTP, Gateway/Nanopayments, App Kit, Contracts, USYC, USDC.
- **20% Innovation** — novel approaches, emergent behavior, research insight.
- Judges: panel from Solana, Coinbase, Arc/Circle, Protocol Labs. Async review, no live demo day.

## Submission requirements
- Public **GitHub repository**.
- Recorded **video demo** (≤3 min recommended) on Loom/YouTube/Vimeo.
- **Traction reporting:** user count, validation, transactions during the event window.
- Strongly encouraged: a **live deployed product** judges can use hands-on.
- Submit via the hackathon form; multiple submissions allowed (submit early + often).

## Six Requests for Builders (RFBs) — optional framing, not required tracks
1. Perpetual Futures Trading Agent  *(we avoid — leverage/perps = gharar; see 01-decisions)*
2. Prediction Market Trader Intelligence  *(our forecasting/intelligence angle relates here)*
3. Prediction Market Verticals
4. Adaptive Portfolio Manager  *(our managed-trading track relates here)*
5. Cross-Platform Arbitrage Agent
6. Social Trading Intelligence

## Arc (settlement chain)
- Open **L1 by Circle**, **EVM-compatible**, built for stablecoin finance.
- **USDC is the native gas token** (no separate gas token). ~$0.01 fees, sub-second deterministic finality.
- **Testnet** live (faucet, RPC, explorer). Mainnet later in 2026.
- Consensus: Malachite Tendermint BFT. Has a native FX engine.

## Circle developer tools (relevant)
- **Programmable Wallets** (developer-controlled, MPC) — create/fund/sign for many agents.
- **Gateway / Nanopayments** — gas-free USDC transfers as small as $0.000001 (EIP-3009 offchain signing, batched).
- **CCTP** — cross-chain USDC (only relevant if we go multi-chain).
- **USYC** — tokenized money-market fund (yield). **Out of scope** — yield = riba (see 01-decisions).
- **Paymaster** — pay gas in USDC (not needed on Arc; gas already USDC).
- **App Kit** — Bridge/Swap/Send/Unified-Balance UI components.

## Key links
- Hackathon: https://agora.thecanteenapp.com
- Arc docs: https://docs.arc.network  · Circle docs: https://developers.circle.com
- Arc CLI: `uv tool install git+https://github.com/the-canteen-dev/ARC-cli` (command: `arc-canteen`)
- Canteen org repos: ARC-cli, context-arc (synced docs + 5 samples), circle-agent (x402 nanopayment demo)
- Discords: Canteen `https://discord.gg/TGnyfKh23V` · Arc Builder `https://discord.com/invite/buildonarc` (mention "Canteen + Agora")
</content>
