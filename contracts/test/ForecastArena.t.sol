// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ForecastArena} from "../src/ForecastArena.sol";
import {MockIdentityRegistry, MockReputationRegistry} from "./mocks/MockERC8004.sol";

contract ForecastArenaTest is Test {
    ForecastArena internal arena;
    MockIdentityRegistry internal identity;
    MockReputationRegistry internal reputation;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public {
        identity = new MockIdentityRegistry();
        reputation = new MockReputationRegistry();
        // resolver defaults to this test contract
        arena = new ForecastArena(address(this), address(identity), address(reputation));
    }

    function _openRound() internal returns (uint256 id) {
        id = arena.openRound(ForecastArena.Mode.SpotClose, uint64(block.timestamp + 1 hours), "ETH/USDC");
    }

    function test_OpenRound() public {
        uint256 id = _openRound();
        assertEq(id, 1);
        assertEq(arena.roundCount(), 1);
        (,, ForecastArena.Mode mode, bool settled,,,,,) = arena.rounds(id);
        assertEq(uint256(mode), uint256(ForecastArena.Mode.SpotClose));
        assertFalse(settled);
    }

    function test_OnlyResolverOpens() public {
        vm.prank(alice);
        vm.expectRevert(ForecastArena.NotResolver.selector);
        arena.openRound(ForecastArena.Mode.SpotClose, uint64(block.timestamp + 1 hours), "ETH/USDC");
    }

    function test_SubmitAndSettleSelectsClosest() public {
        uint256 id = _openRound();

        vm.prank(alice);
        arena.submitForecast(id, 3000e18, keccak256("alice-reasoning"), 0);
        vm.prank(bob);
        arena.submitForecast(id, 3200e18, keccak256("bob-reasoning"), 0);
        vm.prank(carol);
        arena.submitForecast(id, 2500e18, keccak256("carol-reasoning"), 0);

        vm.warp(block.timestamp + 2 hours);
        // truth=3100: alice err=100, bob err=100, carol err=600. Ties go to the earliest submitter (alice).
        arena.settle(id, 3100e18);

        (,,, bool settled, uint256 truth, address winner, uint256 winnerErr,,) = arena.rounds(id);
        assertTrue(settled);
        assertEq(truth, 3100e18);
        assertEq(winner, alice);
        assertEq(winnerErr, 100e18);
        assertEq(arena.wins(alice), 1);
    }

    function test_ValueHiddenUntilSettled() public {
        uint256 id = _openRound();
        vm.prank(alice);
        arena.submitForecast(id, 3000e18, keccak256("r"), 0);

        // commitment is visible (hash), value is not
        (bytes32 h,, bool exists) = arena.getCommitment(id, alice);
        assertEq(h, keccak256("r"));
        assertTrue(exists);

        vm.expectRevert(ForecastArena.NotSettled.selector);
        arena.getForecastValue(id, alice);

        vm.warp(block.timestamp + 2 hours);
        arena.settle(id, 3100e18);
        assertEq(arena.getForecastValue(id, alice), 3000e18);
    }

    function test_CannotSubmitAfterClose() public {
        uint256 id = _openRound();
        vm.warp(block.timestamp + 2 hours);
        vm.prank(alice);
        vm.expectRevert(ForecastArena.RoundClosed.selector);
        arena.submitForecast(id, 3000e18, keccak256("r"), 0);
    }

    function test_CannotDoubleSubmit() public {
        uint256 id = _openRound();
        vm.startPrank(alice);
        arena.submitForecast(id, 3000e18, keccak256("r"), 0);
        vm.expectRevert(ForecastArena.AlreadyForecast.selector);
        arena.submitForecast(id, 3100e18, keccak256("r2"), 0);
        vm.stopPrank();
    }

    function test_CannotSettleBeforeClose() public {
        uint256 id = _openRound();
        vm.expectRevert(ForecastArena.RoundNotClosed.selector);
        arena.settle(id, 3100e18);
    }

    function test_CannotDoubleSettle() public {
        uint256 id = _openRound();
        vm.warp(block.timestamp + 2 hours);
        arena.settle(id, 3100e18);
        vm.expectRevert(ForecastArena.AlreadySettled.selector);
        arena.settle(id, 3100e18);
    }

    function test_EmptyRoundSettles() public {
        uint256 id = _openRound();
        vm.warp(block.timestamp + 2 hours);
        arena.settle(id, 3100e18);
        (,,, bool settled,, address winner,, uint32 n,) = arena.rounds(id);
        assertTrue(settled);
        assertEq(winner, address(0));
        assertEq(n, 0);
    }

    function test_AgentIdOwnershipEnforced() public {
        uint256 id = _openRound();
        uint256 aliceAgent = identity.mintTo(alice, "ipfs://alice");

        // bob tries to use alice's agentId
        vm.prank(bob);
        vm.expectRevert(ForecastArena.BadAgentId.selector);
        arena.submitForecast(id, 3000e18, keccak256("r"), aliceAgent);

        // alice uses her own agentId -> ok
        vm.prank(alice);
        arena.submitForecast(id, 3000e18, keccak256("r"), aliceAgent);
        (, uint256 agentId,) = arena.getCommitment(id, alice);
        assertEq(agentId, aliceAgent);
    }

    function test_PushReputation() public {
        uint256 id = _openRound();
        uint256 aliceAgent = identity.mintTo(alice, "ipfs://alice");
        uint256 bobAgent = identity.mintTo(bob, "ipfs://bob");

        vm.prank(alice);
        arena.submitForecast(id, 3050e18, keccak256("ar"), aliceAgent);
        vm.prank(bob);
        arena.submitForecast(id, 3500e18, keccak256("br"), bobAgent);

        vm.warp(block.timestamp + 2 hours);
        arena.settle(id, 3000e18); // alice closer -> winner

        arena.pushReputation(id, alice);
        assertEq(reputation.count(), 1);
        assertEq(reputation.lastScore(), int128(100)); // winner
        assertEq(reputation.lastAgentId(), aliceAgent);

        arena.pushReputation(id, bob);
        assertEq(reputation.count(), 2);
        // bob err = 500/3000 = ~16.6% -> score ~ 84
        assertGt(reputation.lastScore(), int128(80));
        assertLt(reputation.lastScore(), int128(90));

        // idempotent
        vm.expectRevert(ForecastArena.AlreadyPushed.selector);
        arena.pushReputation(id, alice);
    }

    function test_PushReputationRequiresSettled() public {
        uint256 id = _openRound();
        vm.prank(alice);
        arena.submitForecast(id, 3000e18, keccak256("r"), 0);
        vm.expectRevert(ForecastArena.NotSettled.selector);
        arena.pushReputation(id, alice);
    }

    function test_GetParticipants() public {
        uint256 id = _openRound();
        vm.prank(alice);
        arena.submitForecast(id, 1, keccak256("a"), 0);
        vm.prank(bob);
        arena.submitForecast(id, 2, keccak256("b"), 0);
        address[] memory ps = arena.getParticipants(id);
        assertEq(ps.length, 2);
        assertEq(ps[0], alice);
        assertEq(ps[1], bob);
    }
}
