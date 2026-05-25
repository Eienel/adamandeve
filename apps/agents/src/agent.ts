import { keccak256, toBytes, parseUnits, type Address } from "viem";
import {
  makeWalletClient,
  makePublicClient,
  forecastArenaAbi,
  store,
} from "@arena/shared";
import { modelForecast, heuristics, hasModelProvider, type MarketContext, type StrategyName } from "./strategies.js";

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
  private relayWallet?: ReturnType<typeof makeWalletClient>;

  constructor(cfg: AgentConfig) {
    this.name = cfg.name;
    this.strategy = cfg.strategy;
    this.wallet = makeWalletClient(cfg.privateKey);
    this.pub = makePublicClient();
    this.address = this.wallet.account!.address;
    this.arena = cfg.arena;
    this.agentId = cfg.agentId ?? 0n;
    const relayKey = (process.env.RELAY_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY) as `0x${string}` | undefined;
    this.relayWallet = relayKey ? makeWalletClient(relayKey) : undefined;
    this.model =
      cfg.model ??
      process.env.AGENT_MODEL ??
      (process.env.AWS_BEARER_TOKEN_BEDROCK ? "us.anthropic.claude-3-5-haiku-20241022-v1:0" : "claude-haiku-4-5-20251001");
  }

  /** Update the ERC-8004 agentId after a lazy (post-funding) registration. */
  setAgentId(id: bigint): void {
    this.agentId = id;
  }

  /** Decide a forecast for the round, submit it on-chain, and persist the reasoning trace. */
  async forecastRound(roundId: number, ctx: MarketContext): Promise<{ value: number; txHash: string }> {
    const f = hasModelProvider() ? await modelForecast(this.strategy, ctx, this.model) : heuristics[this.strategy](ctx);

    const value = parseUnits(f.value.toFixed(6), 18);
    const traceHash = keccak256(toBytes(f.reasoning));

    const signer = this.relayWallet ?? this.wallet;
    const txHash = await signer.writeContract({
      address: this.arena,
      abi: forecastArenaAbi,
      functionName: "submitForecast",
      args: [BigInt(roundId), value, traceHash, this.agentId],
      account: signer.account!,
      chain: signer.chain,
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
