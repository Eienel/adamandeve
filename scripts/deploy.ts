import fs from "node:fs";
import path from "node:path";
import { parseUnits, type Abi, type Address, type WalletClient, type PublicClient } from "viem";
import {
  makeWalletClient,
  makePublicClient,
  rpcUrl,
  saveDeployment,
  erc20Abi,
  miniAmmAbi,
  ARC_USDC,
  ARC_IDENTITY_REGISTRY,
  ARC_REPUTATION_REGISTRY,
  type Deployment,
} from "@arena/shared";

const OUT = path.resolve(process.cwd(), "contracts/out");

function artifact(file: string, name: string): { abi: Abi; bytecode: `0x${string}` } {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, file, `${name}.json`), "utf8"));
  return { abi: j.abi as Abi, bytecode: j.bytecode.object as `0x${string}` };
}

async function deploy(
  wallet: WalletClient,
  pub: PublicClient,
  file: string,
  name: string,
  args: unknown[],
): Promise<Address> {
  const { abi, bytecode } = artifact(file, name);
  const hash = await wallet.deployContract({
    abi,
    bytecode,
    args,
    account: wallet.account!,
    chain: wallet.chain,
  });
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  if (!rcpt.contractAddress) throw new Error(`deploy ${name} failed`);
  console.log(`  ${name.padEnd(22)} ${rcpt.contractAddress}`);
  return rcpt.contractAddress;
}

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY not set");
  const wallet = makeWalletClient(pk);
  const pub = makePublicClient();
  const deployer = wallet.account!.address;
  const isArc = rpcUrl().includes("arc.network");
  const chainId = await pub.getChainId();

  console.log(`Deploying to chain ${chainId} (${isArc ? "Arc testnet" : "local"}) as ${deployer}`);

  let usdc: Address;
  let identity: Address;
  let reputation: Address;

  if (isArc) {
    usdc = ARC_USDC;
    identity = ARC_IDENTITY_REGISTRY;
    reputation = ARC_REPUTATION_REGISTRY;
    console.log("  Using real Arc USDC + ERC-8004 registries");
  } else {
    usdc = await deploy(wallet, pub, "MockERC20.sol", "MockERC20", ["USD Coin", "USDC", 6]);
    identity = await deploy(wallet, pub, "MockERC8004.sol", "MockIdentityRegistry", []);
    reputation = await deploy(wallet, pub, "MockERC8004.sol", "MockReputationRegistry", []);
  }

  const demoToken = await deploy(wallet, pub, "MockERC20.sol", "MockERC20", ["Arena Demo Token", "ADT", 18]);
  const arena = await deploy(wallet, pub, "ForecastArena.sol", "ForecastArena", [deployer, identity, reputation]);
  const prizePool = await deploy(wallet, pub, "PrizePool.sol", "PrizePool", [usdc]);
  const miniAmm = await deploy(wallet, pub, "MiniAMM.sol", "MiniAMM", [demoToken, usdc]);

  if (!isArc) {
    console.log("Seeding MiniAMM liquidity + minting demo balances...");
    const mint = async (token: Address, to: Address, amount: bigint) => {
      const h = await wallet.writeContract({ address: token, abi: erc20Abi, functionName: "mint", args: [to, amount], account: wallet.account!, chain: wallet.chain });
      await pub.waitForTransactionReceipt({ hash: h });
    };
    const approve = async (token: Address, spender: Address, amount: bigint) => {
      const h = await wallet.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount], account: wallet.account!, chain: wallet.chain });
      await pub.waitForTransactionReceipt({ hash: h });
    };
    await mint(demoToken, deployer, parseUnits("100000", 18));
    await mint(usdc, deployer, parseUnits("100000000", 6));
    await approve(demoToken, miniAmm, parseUnits("100000", 18));
    await approve(usdc, miniAmm, parseUnits("100000000", 6));
    const h = await wallet.writeContract({
      address: miniAmm,
      abi: miniAmmAbi,
      functionName: "addLiquidity",
      args: [parseUnits("1000", 18), parseUnits("3000000", 6)], // ~3000 USDC / ADT
      account: wallet.account!,
      chain: wallet.chain,
    });
    await pub.waitForTransactionReceipt({ hash: h });
  }

  const deployment: Deployment = {
    chainId,
    forecastArena: arena,
    miniAmm,
    prizePool,
    demoToken,
    usdc,
    identityRegistry: identity,
    reputationRegistry: reputation,
  };
  saveDeployment(deployment);
  console.log("Deployment written to", process.env.DEPLOYMENTS_FILE ?? "deployments.local.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
