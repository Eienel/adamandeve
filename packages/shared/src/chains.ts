import { defineChain, type Chain } from "viem";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

export const anvilLocal = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

/** Pick a chain from RPC_URL (defaults to local anvil). */
export function chainFromEnv(): Chain {
  const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8545";
  if (rpc.includes("arc.network")) return arcTestnet;
  return anvilLocal;
}

export function rpcUrl(): string {
  return process.env.RPC_URL ?? "http://127.0.0.1:8545";
}
