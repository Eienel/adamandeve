// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MiniAMM} from "../src/MiniAMM.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract MiniAMMTest is Test {
    MiniAMM internal amm;
    MockERC20 internal tok; // base
    MockERC20 internal usdc; // quote

    address internal lp = makeAddr("lp");
    address internal trader = makeAddr("trader");

    function setUp() public {
        tok = new MockERC20("Token", "TOK", 18);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        amm = new MiniAMM(address(tok), address(usdc));

        tok.mint(lp, 1_000e18);
        usdc.mint(lp, 3_000_000e6);
        tok.mint(trader, 100e18);
        usdc.mint(trader, 300_000e6);
    }

    function _seed() internal {
        vm.startPrank(lp);
        tok.approve(address(amm), type(uint256).max);
        usdc.approve(address(amm), type(uint256).max);
        amm.addLiquidity(1_000e18, 3_000_000e6); // price ~ 3000 USDC per TOK
        vm.stopPrank();
    }

    function test_AddLiquiditySetsReservesAndPrice() public {
        _seed();
        assertEq(amm.reserveBase(), 1_000e18);
        assertEq(amm.reserveQuote(), 3_000_000e6);
        assertGt(amm.totalLiquidity(), 0);
        // price = quote*1e18/base = 3_000_000e6 * 1e18 / 1_000e18 = 3000e6
        assertEq(amm.priceQuotePerBase(), 3000e6);
    }

    function test_SwapBaseToQuoteLowersPrice() public {
        _seed();
        uint256 priceBefore = amm.priceQuotePerBase();

        vm.startPrank(trader);
        tok.approve(address(amm), type(uint256).max);
        uint256 out = amm.swap(true, 10e18, 0); // sell 10 TOK for USDC
        vm.stopPrank();

        assertGt(out, 0);
        assertLt(amm.priceQuotePerBase(), priceBefore); // more base in pool -> base cheaper
        assertEq(usdc.balanceOf(trader), 300_000e6 + out);
    }

    function test_QuoteOutMatchesSwap() public {
        _seed();
        uint256 expected = amm.quoteOut(true, 5e18);
        vm.startPrank(trader);
        tok.approve(address(amm), type(uint256).max);
        uint256 out = amm.swap(true, 5e18, 0);
        vm.stopPrank();
        assertEq(out, expected);
    }

    function test_SlippageGuard() public {
        _seed();
        vm.startPrank(trader);
        tok.approve(address(amm), type(uint256).max);
        vm.expectRevert(MiniAMM.Slippage.selector);
        amm.swap(true, 1e18, 1_000_000e6); // demand absurd minOut
        vm.stopPrank();
    }

    function test_RemoveLiquidityReturnsFunds() public {
        _seed();
        uint256 shares = amm.liquidity(lp);
        vm.prank(lp);
        (uint256 baseAmt, uint256 quoteAmt) = amm.removeLiquidity(shares);
        assertApproxEqAbs(baseAmt, 1_000e18, 1e6);
        assertApproxEqAbs(quoteAmt, 3_000_000e6, 1e6);
        assertEq(amm.totalLiquidity(), 0);
    }

    function test_SwapNoLiquidityReverts() public {
        vm.startPrank(trader);
        tok.approve(address(amm), type(uint256).max);
        vm.expectRevert(MiniAMM.NoLiquidity.selector);
        amm.swap(true, 1e18, 0);
        vm.stopPrank();
    }
}
