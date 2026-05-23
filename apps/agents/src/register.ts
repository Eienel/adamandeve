import { decodeEventLog, type Address } from "viem";
import { makeWalletClient, makePublicClient, identityRegistryAbi } from "@arena/shared";

/** Register an agent identity on ERC-8004 and return its tokenId (agentId).
 *  Works against both the real Arc IdentityRegistry and the local mock. */
export async function registerAgent(
  privateKey: `0x${string}`,
  identityRegistry: Address,
  metadataURI: string,
): Promise<bigint> {
  const wallet = makeWalletClient(privateKey);
  const pub = makePublicClient();

  const hash = await wallet.writeContract({
    address: identityRegistry,
    abi: identityRegistryAbi,
    functionName: "register",
    args: [metadataURI],
    account: wallet.account!,
    chain: wallet.chain,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });

  for (const log of receipt.logs) {
    try {
      const ev = decodeEventLog({ abi: identityRegistryAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "Transfer") {
        return (ev.args as unknown as { tokenId: bigint }).tokenId;
      }
    } catch {
      /* not our event */
    }
  }
  throw new Error("register() did not emit a Transfer event");
}
