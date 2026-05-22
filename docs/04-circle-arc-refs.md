# 04 — Circle & Arc References

> Practical integration notes + research findings. Verify TBD values via the `arc-canteen` CLI / official docs during setup.

## Arc testnet (fill in during setup)
- RPC URL: **get via `arc-canteen rpc-url`** (authenticated endpoint). Also `arc-canteen rpc <method> <params>` for raw JSON-RPC.
- Chain ID / network name / explorer URL / faucet: TBD — confirm from https://docs.arc.network and the synced context.
- Native gas token: **USDC** (no separate gas token).
- EVM-compatible → Foundry/Hardhat/thirdweb all work. Use Foundry.

## Arc CLI (`arc-canteen`)
- Install: `uv tool install git+https://github.com/the-canteen-dev/ARC-cli`
- Commands: `login`/`logout`, `rpc`, `rpc-url`, `rotate-rpc-key`, `context`, `context sync`, `update-traction`, `update-product`, `ls`, `history`, `profile-edit`, `shell-init`
- `arc-canteen context sync` → downloads to `~/.arc-canteen/context/`: Arc chain docs, Circle docs, Agent Stack info, and 5 sample codebases (git submodules): **arc-commerce, arc-multichain-wallet, arc-escrow, arc-fintech, arc-p2p-payments**.
- Config at `~/.arc-canteen/config.yaml`.
- **Submission tracking:** `arc-canteen update-traction` and `update-product` — use throughout for the 30% traction score.

## Canteen org repos
- `the-canteen-dev/ARC-cli` — the CLI.
- `the-canteen-dev/context-arc` — synced docs + sample code.
- `the-canteen-dev/circle-agent` — x402 nanopayment demo (payment lifecycle reference; useful for our SignalsMarket payments).

## Circle SDKs / tools
- **Programmable Wallets (developer-controlled, MPC):**
  - SDKs: `@circle-fin/developer-controlled-wallets` (Node 22+), `circle-developer-controlled-wallets` (Python 3.11+)
  - Flow: create wallet set (entity secret) → create N wallets → fund (faucet/treasury) → sign+broadcast server-side.
  - Docs: https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet
  - Arc + dev-controlled wallets guide exists on community.arc.network.
- **Gateway / Nanopayments:** gas-free USDC transfers from $0.000001; EIP-3009 offchain signing + batched settlement.
  - **Arc availability uncertain** → build behind `IFeeCollector` with on-chain USDC fallback.
  - Docs: https://developers.circle.com/gateway/nanopayments  · overview: https://www.circle.com/nanopayments
- **USYC:** tokenized money-market fund (yield). **OUT OF SCOPE** (riba). Docs (for reference only): https://developers.circle.com/tokenized/usyc/subscribe-and-redeem
- **Paymaster:** pay gas in USDC — **not needed on Arc** (gas already USDC).
- **CCTP / App Kit:** only if we go multi-chain (not in current scope). Docs: https://developers.circle.com/cctp

## Claude Agent SDK (agents)
- Anthropic's SDK for building autonomous agents (Python + TS). Agent loop: perceive → reason (Claude) → act (tools) → observe.
- We use it for the forecasting + trading agents; the model's reasoning output **is** the reasoning-trace we sell.
- Docs: https://platform.claude.com/docs/agents  · examples: https://github.com/anthropics

## Contract addresses (VERIFY before use — from research, unconfirmed)
- USDC on Arc (system contract, candidate): `0x3600000000000000000000000000000000000000` — **confirm via Arc docs/explorer before relying on it.**
- Other Circle contracts (CCTP TokenMessenger, etc.): see Arc docs "contract addresses" reference.

## Reference implementations seen (external, for learning only)
- `kenhuangus/arc-ai-agents` (LangGraph multi-agent on Arc), `broomva/arcan` (web3 agent platform). Not dependencies.
</content>
