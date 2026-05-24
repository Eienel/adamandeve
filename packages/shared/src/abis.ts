import ForecastArena from "./abis/ForecastArena.json";
import MiniAMM from "./abis/MiniAMM.json";
import PrizePool from "./abis/PrizePool.json";
import type { Abi } from "viem";

export const forecastArenaAbi = ForecastArena as Abi;
export const miniAmmAbi = MiniAMM as Abi;
export const prizePoolAbi = PrizePool as Abi;

export const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

/** ERC-8004 IdentityRegistry (Arc: 0x8004A818BFB912233c491871b3d84c89A494BD9e) */
export const identityRegistryAbi = [
  { type: "function", name: "register", stateMutability: "nonpayable", inputs: [{ name: "metadataURI", type: "string" }], outputs: [] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "string" }] },
  { type: "event", name: "Transfer", inputs: [{ indexed: true, name: "from", type: "address" }, { indexed: true, name: "to", type: "address" }, { indexed: true, name: "tokenId", type: "uint256" }] },
] as const;

/** ERC-8004 ReputationRegistry (Arc: 0x8004B663056A597Dffe9eCcC1965A193B7388713) */
export const reputationRegistryAbi = [
  { type: "function", name: "giveFeedback", stateMutability: "nonpayable", inputs: [
    { name: "agentId", type: "uint256" }, { name: "score", type: "int128" }, { name: "feedbackType", type: "uint8" },
    { name: "tag", type: "string" }, { name: "metadataURI", type: "string" }, { name: "evidenceURI", type: "string" },
    { name: "comment", type: "string" }, { name: "feedbackHash", type: "bytes32" },
  ], outputs: [] },
] as const;
