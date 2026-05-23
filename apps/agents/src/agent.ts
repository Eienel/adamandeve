import { keccak256, toBytes, parseUnits, type Address } from "viem";
import {
  makeWalletClient,
  makePublicClient,
  forecastArenaAbi,
  store,
} from "@arena/shared";
import { claudeForecast, heuristics, type MarketContext, type StrategyName } from "./strategies.js";

export interface AgentConfig {
  name: string;
  strategy: StrategyName;
  privateKey: `0x${string}`;
  arena: Address;
  agentId?: bigint; // ERC-8004 tokenId
  model?: string;
}

export class Agent {
  readonly name: string;
  readonly strategy: StrategyName;
  readonly address: Address;
  private wallet;
  private pub;
  private arena: Address;
  private agentId: bigint;
  private model: string;

  constructor(cfg: AgentConfig) {
    this.name = cfg.name;
    this.strategy = cfg.strategy;
    this.wallet = makeWalletClient(cfg.privateKey);
    this.pub = makePublicClient();
    this.address = this.wallet.account!.address;
    this.arena = cfg.arena;
    this.agentId = cfg.agentId ?? 0n;
    this.model = cfg.model ?? "claude-haiku-4-5-20251001";
  }

  /** Decide a forecast for the round, submit it on-chain, and persist the reasoning trace. */
  async forecastRound(roundId: number, ctx: MarketContext): Promise<{ value: number; txHash: string }> {
    const useClaude = !!process.env.ANTHROPIC_API_KEY;
    const f = useClaude ? await claudeForecast(this.strategy, ctx, this.model) : heuristics[this.strategy](ctx);

    const value = parseUnits(f.value.toFixed(6), 18);
    const traceHash = keccak256(toBytes(f.reasoning));

    const txHash = await this.wallet.writeContract({
      address: this.arena,
      abi: forecastArenaAbi,
      functionName: "submitForecast",
      args: [BigInt(roundId), value, traceHash, this.agentId],
      account: this.wallet.account!,
      chain: this.wallet.chain,
    });
    await this.pub.waitForTransactionReceipt({ hash: txHash });

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
