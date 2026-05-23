import fs from "node:fs";
import path from "node:path";

export interface Deployment {
  chainId: number;
  forecastArena: `0x${string}`;
  miniAmm: `0x${string}`;
  prizePool: `0x${string}`;
  demoToken: `0x${string}`;
  usdc: `0x${string}`;
  identityRegistry: `0x${string}`;
  reputationRegistry: `0x${string}`;
}

// Real Arc testnet system addresses (see docs/04-circle-arc-refs.md).
export const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;
export const ARC_IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
export const ARC_REPUTATION_REGISTRY = "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;
export const ARC_VALIDATION_REGISTRY = "0x8004Cb1BF31DAf7788923b405b754f57acEB4272" as const;
export const ARC_AGENTIC_COMMERCE = "0x0747EEf0706327138c69792bF28Cd525089e4583" as const;

function deployFile(): string {
  return process.env.DEPLOYMENTS_FILE ?? path.resolve(process.cwd(), "deployments.local.json");
}

export function saveDeployment(d: Deployment, file = deployFile()): void {
  fs.writeFileSync(file, JSON.stringify(d, null, 2));
}

export function loadDeployment(): Deployment {
  const file = deployFile();
  if (!fs.existsSync(file)) {
    throw new Error(`No deployment found at ${file}. Run: pnpm deploy:local`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as Deployment;
}
