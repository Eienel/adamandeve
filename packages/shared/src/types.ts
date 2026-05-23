export enum Mode {
  SpotClose = 0,
  TradeImpact = 1,
}

export interface TraceRecord {
  roundId: number;
  agent: `0x${string}`;
  agentName: string;
  agentId: string; // ERC-8004 tokenId, or "0" if unregistered
  value: string; // forecast value (uint, 18-dec fixed) as string
  reasoning: string; // full reasoning text — the sellable product
  traceHash: `0x${string}`;
  strategy: string;
  createdAt: number;
  txHash?: string;
}

export interface SignalPurchase {
  roundId: number;
  agent: `0x${string}`;
  buyer: string;
  amount: string;
  at: number;
}

export interface AgentInfo {
  address: `0x${string}`;
  name: string;
  strategy: string;
  agentId?: string;
}
