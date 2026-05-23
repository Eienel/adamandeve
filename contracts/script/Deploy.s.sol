// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ForecastArena} from "../src/ForecastArena.sol";
import {MiniAMM} from "../src/MiniAMM.sol";
import {PrizePool} from "../src/PrizePool.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";

/// @notice Deploys the arena suite. Defaults target Arc testnet (chainId 5042002).
///         USDC and the ERC-8004 registries are the real deployed Arc addresses unless
///         overridden via env. A demo base token is deployed for the MiniAMM/quote=USDC.
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.network \
///     --private-key $DEPLOYER_PRIVATE_KEY --broadcast
contract Deploy is Script {
    // Arc testnet defaults
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    address constant ARC_IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant ARC_REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;

    function run() external {
        address usdc = vm.envOr("USDC", ARC_USDC);
        address identity = vm.envOr("IDENTITY_REGISTRY", ARC_IDENTITY_REGISTRY);
        address reputation = vm.envOr("REPUTATION_REGISTRY", ARC_REPUTATION_REGISTRY);
        address resolver = vm.envOr("RESOLVER", address(0)); // 0 -> deployer

        vm.startBroadcast();

        ForecastArena arena = new ForecastArena(resolver, identity, reputation);
        PrizePool prizePool = new PrizePool(usdc);

        // Demo base token for the trade-impact / managed-trading venue (quote = USDC).
        MockERC20 demoToken = new MockERC20("Arena Demo Token", "ADT", 18);
        MiniAMM amm = new MiniAMM(address(demoToken), usdc);

        vm.stopBroadcast();

        console2.log("ForecastArena:", address(arena));
        console2.log("PrizePool:    ", address(prizePool));
        console2.log("MiniAMM:      ", address(amm));
        console2.log("DemoToken:    ", address(demoToken));
        console2.log("USDC:         ", usdc);
        console2.log("IdentityReg:  ", identity);
        console2.log("ReputationReg:", reputation);
    }
}
