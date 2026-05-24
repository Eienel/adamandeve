# 04 — Circle & Arc References

> Practical integration notes + research findings. Verify TBD values via the `arc-canteen` CLI / official docs during setup.

## Arc testnet (CONFIRMED from synced context)
| Field | Value |
|-------|-------|
| Network | Arc Testnet |
| Chain ID | `5042002` (hex `0x4CEF52`) |
| RPC | `https://rpc.testnet.arc.network` (public; no auth) |
| WebSocket | `wss://rpc.testnet.arc.network` |
| Explorer | https://testnet.arcscan.app |
| Faucet | https://faucet.circle.com (and https://console.circle.com/faucet) |
| CCTP domain | `26` |

- Native gas token: **USDC**. **Dual decimals: native gas = 18 decimals, ERC-20 USDC = 6 decimals.** Do not mix.
- EVM-compatible → Foundry/Hardhat/viem/wagmi work. `arcTestnet` chain is built into viem (no custom chain def needed).
- `arc-canteen rpc <method> [params]` proxies JSON-RPC (read-mostly allowlist + `eth_sendRawTransaction`). `arc-canteen rpc eth_chainId` → `0x4cef52`.
- Auth note: `arc-canteen login` needs interactive GitHub device flow; the public RPC above works without it.

### Token addresses (Arc testnet)
| Token | Address | Decimals |
|-------|---------|----------|
| USDC | `0x3600000000000000000000000000000000000000` | 6 |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 |

### Agentic-economy standards — DEPLOYED on Arc testnet (we build on these)
ERC-8004 (identity / reputation / validation):
| Contract | Address | Key fn |
|----------|---------|--------|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `register(string metadataURI)` → mints ERC-721 identity NFT; agentId = tokenId; `ownerOf`, `tokenURI` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `giveFeedback(uint256 agentId,int128 score,uint8 feedbackType,string tag,string metadataURI,string evidenceURI,string comment,bytes32 feedbackHash)` — owner can NOT rate own agent |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | `validationRequest(...)` / `validationResponse(...)` / `getValidationStatus(bytes32)` |

ERC-8183 (job lifecycle / escrow settlement):
| Contract | Address | Lifecycle |
|----------|---------|-----------|
| AgenticCommerce ref impl | `0x0747EEf0706327138c69792bF28Cd525089e4583` | `createJob(provider,evaluator,expiredAt,description,hook)` → `setBudget(jobId,amount,0x)` → USDC `approve` → `fund(jobId,0x)` → `submit(jobId,bytes32 deliverable,0x)` → `complete(jobId,bytes32 reason,0x)`; states: Open,Funded,Submitted,Completed,Rejected,Expired |

How we use them: agents register identity (ERC-8004) → forecast accuracy recorded as reputation (our arena contract is the neutral attestor, satisfies non-self-dealing) → selling intelligence / managed work settled as ERC-8183 jobs (escrowed USDC, deliverable = forecast/reasoning hash). Gas station: ~0.006 USDC per tx.

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
