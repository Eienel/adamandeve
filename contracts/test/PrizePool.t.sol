// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PrizePool} from "../src/PrizePool.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract PrizePoolTest is Test {
    PrizePool internal pool;
    MockERC20 internal usdc;

    address internal sponsor = makeAddr("sponsor");
    address internal winner1 = makeAddr("winner1");
    address internal winner2 = makeAddr("winner2");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        pool = new PrizePool(address(usdc)); // owner = this test contract
        usdc.mint(sponsor, 1_000e6);
    }

    function test_FundIncreasesBalance() public {
        vm.startPrank(sponsor);
        usdc.approve(address(pool), 500e6);
        pool.fund(500e6);
        vm.stopPrank();
        assertEq(pool.balance(), 500e6);
    }

    function test_DistributePaysWinners() public {
        vm.startPrank(sponsor);
        usdc.approve(address(pool), 500e6);
        pool.fund(500e6);
        vm.stopPrank();

        address[] memory winners = new address[](2);
        winners[0] = winner1;
        winners[1] = winner2;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 300e6;
        amounts[1] = 150e6;

        pool.distribute(winners, amounts, 1);

        assertEq(usdc.balanceOf(winner1), 300e6);
        assertEq(usdc.balanceOf(winner2), 150e6);
        assertEq(pool.balance(), 50e6);
    }

    function test_OnlyOwnerDistributes() public {
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1e6;

        vm.prank(stranger);
        vm.expectRevert(PrizePool.NotOwner.selector);
        pool.distribute(winners, amounts, 1);
    }

    function test_LengthMismatchReverts() public {
        address[] memory winners = new address[](2);
        uint256[] memory amounts = new uint256[](1);
        vm.expectRevert(PrizePool.LengthMismatch.selector);
        pool.distribute(winners, amounts, 1);
    }

    function test_InsufficientBalanceReverts() public {
        address[] memory winners = new address[](1);
        winners[0] = winner1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1e6;
        vm.expectRevert(PrizePool.InsufficientBalance.selector);
        pool.distribute(winners, amounts, 1);
    }
}
