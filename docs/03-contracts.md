# 03 — Smart Contracts

> Solidity + Foundry on Arc testnet. Addresses filled in after deploy. Reuse Arc samples (arc-escrow, arc-p2p-payments) for custody + USDC flows.

## Layout
```
contracts/
  src/
    ForecastRegistry.sol
    PrizeVault.sol
    SignalsMarket.sol
    MiniAMM.sol
    ManagedVault.sol            # stretch (mudarabah)
    interfaces/IFeeCollector.sol
  test/
  script/Deploy.s.sol
```

## ForecastRegistry (core — competition + provenance)
- `struct Round { uint256 id; Mode mode; uint64 openTs; uint64 closeTs; bool scored; uint256 truthPrice; }`
- `mapping(uint256 => Forecast[]) forecasts;`  `struct Forecast { address agent; uint256 value; bytes32 traceHash; }`
- `openRound(Mode mode, uint64 closeTs)` — resolver-only → `RoundOpened(id, mode, closeTs)`
- `submitForecast(uint256 roundId, uint256 value, bytes32 traceHash)` — **free** (no fee/stake); emits `ForecastCommitted(roundId, msg.sender, traceHash)` (**no value emitted**)
- `score(uint256 roundId, uint256 truthPrice)` — resolver-only; ranks `|value − truth|`; updates `reputation[agent]`; emits `RoundScored(roundId, truthPrice)`
- Per-round `revealMode` flag → optional `commit(bytes32)` / `reveal(uint256 value, bytes32 salt)` for flagship rounds
- View: `reputation(address) → score`, leaderboard read helpers

## PrizeVault (juʿāla — competition prizes)
- Funded by **treasury/sponsor only** (`fund()` from owner). **Never** from participant stakes.
- `distribute(address[] winners, uint256[] amounts)` — owner/resolver, based on accuracy leaderboard; emits `PrizePaid`
- Holds USDC; `withdraw` (owner)

## SignalsMarket (ijāra — sell intelligence)
- `buySignal(uint256 roundId, address agent)` — buyer pays a micro-fee via `IFeeCollector`; emits `TraceUnlocked(roundId, agent, buyer)`; backend gates reasoning text release on this event
- Splits payment: producing **agent gets the bulk**, platform takes a small **commission** (halal brokerage fee)
- Optional subscription helper (`subscribe(agent, periods)`)

## MiniAMM (real spot venue)
- Uniswap-v2-lite constant-product `TOK/USDC`: `addLiquidity`, `removeLiquidity`, `swap`
- We seed liquidity. Used for **trade-impact** truth (execution price) and the managed-trading track. **Spot only, no leverage.**

## ManagedVault (stretch — muḍāraba)
- `deposit(uint256 amount, address agent)` — depositor → assigns mudarib agent
- Agent executes real spot swaps via MiniAMM; `settleProfit()` shares realized profit per ratio; capital bears loss
- No principal guarantee, no fixed return (avoids riba)

## IFeeCollector (fee abstraction — keeps us valid if Nanopayments isn't on Arc)
- `collect(address from, address to, uint256 amount)` 
- Impls: `NanoFeeCollector` (Circle Gateway/Nanopayments, EIP-3009) and `OnChainUSDCFeeCollector` (direct `transferFrom`). Detect at boot; auto-fallback.
- **Fees only ever pay for a service (signals) or a platform commission — never pooled into competition prizes** (maysir guard).

## Invariants to keep (fiqh)
- No function moves participant stake into a prize pot.
- No interest/yield accrual anywhere.
- Trading is spot, immediate, permissible assets only.
</content>
