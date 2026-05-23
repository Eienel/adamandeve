// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title MiniAMM
/// @notice Minimal constant-product (x*y=k) spot AMM for a base/quote pair.
///         Used as (a) the trustless truth source for TradeImpact rounds (the execution
///         price of a real swap) and (b) the venue for the real managed-trading track.
/// @dev    Spot only, immediate settlement, no leverage (keeps the trading track within
///         permissible bounds).
contract MiniAMM {
    IERC20Minimal public immutable base;
    IERC20Minimal public immutable quote;

    uint256 public reserveBase;
    uint256 public reserveQuote;
    uint256 public totalLiquidity;
    mapping(address => uint256) public liquidity;

    uint256 public constant FEE_BPS = 30; // 0.30%

    event LiquidityAdded(address indexed provider, uint256 baseAmt, uint256 quoteAmt, uint256 shares);
    event LiquidityRemoved(address indexed provider, uint256 baseAmt, uint256 quoteAmt, uint256 shares);
    event Swap(address indexed trader, bool baseToQuote, uint256 amountIn, uint256 amountOut, uint256 priceAfter);

    error ZeroAmount();
    error NoLiquidity();
    error InsufficientShares();
    error Slippage();
    error TransferFailed();

    constructor(address _base, address _quote) {
        base = IERC20Minimal(_base);
        quote = IERC20Minimal(_quote);
    }

    function addLiquidity(uint256 baseAmt, uint256 quoteAmt) external returns (uint256 shares) {
        if (baseAmt == 0 || quoteAmt == 0) revert ZeroAmount();
        _pull(base, msg.sender, baseAmt);
        _pull(quote, msg.sender, quoteAmt);

        if (totalLiquidity == 0) {
            shares = _sqrt(baseAmt * quoteAmt);
        } else {
            uint256 s1 = (baseAmt * totalLiquidity) / reserveBase;
            uint256 s2 = (quoteAmt * totalLiquidity) / reserveQuote;
            shares = s1 < s2 ? s1 : s2;
        }
        if (shares == 0) revert ZeroAmount();

        liquidity[msg.sender] += shares;
        totalLiquidity += shares;
        reserveBase += baseAmt;
        reserveQuote += quoteAmt;

        emit LiquidityAdded(msg.sender, baseAmt, quoteAmt, shares);
    }

    function removeLiquidity(uint256 shares) external returns (uint256 baseAmt, uint256 quoteAmt) {
        if (shares == 0 || shares > liquidity[msg.sender]) revert InsufficientShares();
        baseAmt = (shares * reserveBase) / totalLiquidity;
        quoteAmt = (shares * reserveQuote) / totalLiquidity;

        liquidity[msg.sender] -= shares;
        totalLiquidity -= shares;
        reserveBase -= baseAmt;
        reserveQuote -= quoteAmt;

        _push(base, msg.sender, baseAmt);
        _push(quote, msg.sender, quoteAmt);

        emit LiquidityRemoved(msg.sender, baseAmt, quoteAmt, shares);
    }

    /// @notice Swap an exact `amountIn`. `baseToQuote` sells base for quote.
    function swap(bool baseToQuote, uint256 amountIn, uint256 minOut) external returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        if (reserveBase == 0 || reserveQuote == 0) revert NoLiquidity();

        uint256 amountInWithFee = (amountIn * (10_000 - FEE_BPS)) / 10_000;

        if (baseToQuote) {
            _pull(base, msg.sender, amountIn);
            amountOut = (reserveQuote * amountInWithFee) / (reserveBase + amountInWithFee);
            if (amountOut < minOut) revert Slippage();
            reserveBase += amountIn;
            reserveQuote -= amountOut;
            _push(quote, msg.sender, amountOut);
        } else {
            _pull(quote, msg.sender, amountIn);
            amountOut = (reserveBase * amountInWithFee) / (reserveQuote + amountInWithFee);
            if (amountOut < minOut) revert Slippage();
            reserveQuote += amountIn;
            reserveBase -= amountOut;
            _push(base, msg.sender, amountOut);
        }

        emit Swap(msg.sender, baseToQuote, amountIn, amountOut, priceQuotePerBase());
    }

    /// @notice Spot price of 1 base unit in quote, scaled by 1e18.
    function priceQuotePerBase() public view returns (uint256) {
        if (reserveBase == 0) return 0;
        return (reserveQuote * 1e18) / reserveBase;
    }

    /// @notice Quote the output of a swap without executing (for agent planning).
    function quoteOut(bool baseToQuote, uint256 amountIn) external view returns (uint256) {
        if (amountIn == 0 || reserveBase == 0 || reserveQuote == 0) return 0;
        uint256 amountInWithFee = (amountIn * (10_000 - FEE_BPS)) / 10_000;
        return baseToQuote
            ? (reserveQuote * amountInWithFee) / (reserveBase + amountInWithFee)
            : (reserveBase * amountInWithFee) / (reserveQuote + amountInWithFee);
    }

    function _pull(IERC20Minimal token, address from, uint256 amount) internal {
        if (!token.transferFrom(from, address(this), amount)) revert TransferFailed();
    }

    function _push(IERC20Minimal token, address to, uint256 amount) internal {
        if (!token.transfer(to, amount)) revert TransferFailed();
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
