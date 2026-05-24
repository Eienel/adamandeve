import fs from "node:fs";
import { ARC_IDENTITY_REGISTRY } from "@arena/shared";
import { createCircleClient, createAgentWallets, registerAgentViaCircle } from "@arena/agents";

/** Bootstrap the agent fleet on Arc testnet using Circle Programmable Wallets.
 *  Requires CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET. After wallets are created you must fund
 *  each at https://faucet.circle.com (USDC = gas on Arc) before registration succeeds. */
async function main() {
  const count = Number(process.env.FLEET_SIZE ?? 3);
  const client = createCircleClient();

  console.log(`Creating ${count} Circle SCA wallets on ARC-TESTNET...`);
  const wallets = await createAgentWallets(client, count);
  fs.writeFileSync("agent-wallets.arc.json", JSON.stringify(wallets, null, 2));
  for (const w of wallets) console.log(`  ${w.address}  (id ${w.id})`);

  console.log("\nFund each wallet with testnet USDC at https://faucet.circle.com, then re-run with REGISTER=1.");
  if (process.env.REGISTER !== "1") return;

  for (let i = 0; i < wallets.length; i++) {
    try {
      const agentId = await registerAgentViaCircle(client, wallets[i].address, ARC_IDENTITY_REGISTRY, `ipfs://agent-${i}`);
      console.log(`  registered ${wallets[i].address} -> agentId ${agentId}`);
    } catch (e) {
      console.log(`  registration failed for ${wallets[i].address}: ${String(e)} (is it funded?)`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
