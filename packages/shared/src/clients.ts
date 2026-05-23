import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chainFromEnv, rpcUrl } from "./chains.js";

export function makePublicClient(): PublicClient {
  return createPublicClient({ chain: chainFromEnv(), transport: http(rpcUrl()) });
}

export function makeWalletClient(privateKey: `0x${string}`): WalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: chainFromEnv(), transport: http(rpcUrl()) });
}

export { privateKeyToAccount };
