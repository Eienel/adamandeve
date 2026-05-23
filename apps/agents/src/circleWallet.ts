import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { decodeEventLog, type Address } from "viem";
import { makePublicClient, identityRegistryAbi } from "@arena/shared";

/** Circle Programmable Wallets (developer-controlled, MPC) integration for the Arc path.
 *  Requires CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET. Each agent gets a Circle SCA wallet on
 *  ARC-TESTNET, then registers an ERC-8004 identity. (Cannot run without keys + faucet funding.) */

export type CircleClient = ReturnType<typeof initiateDeveloperControlledWalletsClient>;

export function createCircleClient(): CircleClient {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) {
    throw new Error("CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required for the Circle wallet path");
  }
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

export interface AgentWallet {
  id: string;
  address: Address;
}

/** Create `count` Circle SCA wallets on Arc testnet. */
export async function createAgentWallets(client: CircleClient, count: number): Promise<AgentWallet[]> {
  const walletSet = await client.createWalletSet({ name: "Forecast Arena Agents" });
  const res = await client.createWallets({
    blockchains: ["ARC-TESTNET"],
    count,
    walletSetId: walletSet.data?.walletSet?.id ?? "",
    accountType: "SCA",
  });
  return (res.data?.wallets ?? []).map((w) => ({ id: w.id!, address: w.address as Address }));
}

async function waitForTx(client: CircleClient, id: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data } = await client.getTransaction({ id });
    if (data?.transaction?.state === "COMPLETE") return data.transaction.txHash!;
    if (data?.transaction?.state === "FAILED") throw new Error("Circle tx failed");
  }
  throw new Error("Circle tx timed out");
}

/** Register an ERC-8004 identity for a Circle wallet and return the minted agentId. */
export async function registerAgentViaCircle(
  client: CircleClient,
  walletAddress: Address,
  identityRegistry: Address,
  metadataURI: string,
): Promise<bigint> {
  const tx = await client.createContractExecutionTransaction({
    walletAddress,
    blockchain: "ARC-TESTNET",
    contractAddress: identityRegistry,
    abiFunctionSignature: "register(string)",
    abiParameters: [metadataURI],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const txHash = await waitForTx(client, tx.data?.id!);

  const pub = makePublicClient();
  const receipt = await pub.getTransactionReceipt({ hash: txHash as `0x${string}` });
  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: identityRegistryAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "Transfer") return (ev.args as unknown as { tokenId: bigint }).tokenId;
    } catch {
      /* not our event */
    }
  }
  throw new Error("register() via Circle did not emit Transfer");
}
