# 03 — Smart Contracts (as built)

> Solidity + Foundry. 24 tests passing (`cd contracts && forge test`). ABIs are exported to
> `packages/shared/src/abis/`. On Arc the deploy auto-uses real USDC + ERC-8004 registries.

## Layout
```
contracts/
  src/
    ForecastArena.sol
    MiniAMM.sol
    PrizePool.sol
    interfaces/IERC8004.sol      # IIdentityRegistry, IReputationRegistry
  test/
    ForecastArena.t.sol  MiniAMM.t.sol  PrizePool.t.sol
    mocks/MockERC20.sol  mocks/MockERC8004.sol
  script/Deploy.s.sol            # forge deploy (TS scripts/deploy.ts is the primary path)
```

## ForecastArena (competition engine + provenance)
- `openRound(Mode mode, uint64 closeTs, string subject)` — resolver-only → `RoundOpened`.
- `submitForecast(uint256 roundId, uint256 value, bytes32 traceHash, uint256 agentId)` — **free**.
  Emits `ForecastCommitted` with the **traceHash only** (value never emitted). Optional ERC-8004
  ownership check on `agentId`.
- `settle(uint256 roundId, uint256 truthPrice)` — resolver-only; ranks `|value − truth|`, sets
  winner, increments `wins`. Emits `RoundSettled`.
- `pushReputation(uint256 roundId, address agent)` — permissionless, idempotent; writes a 0–100
  accuracy score to ERC-8004 ReputationRegistry (contract is a neutral attestor → non-self-dealing OK).
- Anti-copy: `_forecasts` is internal; `getForecastValue` reverts until settled; `getCommitment`
  exposes only `(traceHash, agentId, exists)` pre-settlement.
- Leaderboard views: `wins`, `roundsPlayed`, `getParticipants`.

## MiniAMM (real spot venue)
- Constant-product `base/quote` (0.30% fee): `addLiquidity` / `removeLiquidity` / `swap` /
  `priceQuotePerBase` / `quoteOut`. Spot only, no leverage. Used for trade-impact truth + managed trading.

## PrizePool (ju'ala — competition prizes)
- `fund(amount)` (owner/sponsor only) → `distribute(winners[], amounts[], roundRef)` (owner).
- INVARIANT: competitors never pay in; prizes are never a pot of lost stakes.

## Standards used instead of custom contracts
- **ERC-8004** (Arc deployed): identity + reputation. We call IdentityRegistry/ReputationRegistry.
- **ERC-8183** (Arc deployed): job lifecycle / USDC escrow — the on-chain settlement option for the
  paid-service track (see `04-circle-arc-refs.md` for addresses).
- **x402 + Nanopayments**: pay-per-read intelligence sales (see `apps/api` signals endpoints).

## Fiqh invariants (kept true in code)
- No function moves participant stake into a prize pot (no maysir).
- No interest/yield anywhere (no riba).
- Trading is spot, immediate, no leverage (no gharar).
