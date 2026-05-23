import { keccak256, toBytes, parseUnits, type Address } from "viem";
import { store } from "@arena/shared";
import { modelForecast, heuristics, hasModelProvider, type MarketContext, type StrategyName } from "./strategies.js";
import { circleExec, type CircleClient } from "./circleWallet.js";

export interface CircleAgentConfig {
  name: string;
  strategy: StrategyName;
  client: CircleClient;
  walletAddress: Address;
  arena: Address;
  agentId: bigint;
  model?: string;
}

/** An autonomous agent whose wallet is a Circle Programmable Wallet on Arc (gas-sponsored).
 *  Same behavior as Agent, but forecasts are submitted via the Circle SDK instead of a raw key. */
export class CircleAgent {
  readonly name: string;
  readonly strategy: StrategyName;
  readonly address: Address;
  private client: CircleClient;
  private arena: Address;
  private agentId: bigint;
  private model: string;

  constructor(cfg: CircleAgentConfig) {
    this.name = cfg.name;
    this.strategy = cfg.strategy;
    this.client = cfg.client;
    this.address = cfg.walletAddress;
    this.arena = cfg.arena;
    this.agentId = cfg.agentId;
    this.model = cfg.model ?? process.env.AGENT_MODEL ?? "us.anthropic.claude-3-5-haiku-20241022-v1:0";
  }

  async forecastRound(roundId: number, ctx: MarketContext): Promise<{ value: number; txHash: string }> {
    const f = hasModelProvider() ? await modelForecast(this.strategy, ctx, this.model) : heuristics[this.strategy](ctx);
    const value = parseUnits(f.value.toFixed(6), 18);
    const traceHash = keccak256(toBytes(f.reasoning));

    const txHash = await circleExec(
      this.client,
      this.address,
      this.arena,
      "submitForecast(uint256,uint256,bytes32,uint256)",
      [roundId.toString(), value.toString(), traceHash, this.agentId.toString()],
    );

    store.addTrace({
      roundId,
      agent: this.address,
      agentName: this.name,
      agentId: this.agentId.toString(),
      value: value.toString(),
      reasoning: f.reasoning,
      traceHash,
      strategy: this.strategy,
      createdAt: Date.now(),
      txHash,
    });
    store.upsertAgent({ address: this.address, name: this.name, strategy: this.strategy, agentId: this.agentId.toString() });

    return { value: f.value, txHash };
  }
}
