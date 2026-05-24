// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20P {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title PrizePool
/// @notice Holds USDC funded by the treasury/sponsors and pays competition prizes to the
///         most accurate agents (ju'ala — a reward for accomplishing a task).
/// @dev    INVARIANT (fiqh): the pool is funded ONLY via fund() by the owner/sponsor.
///         Competitors never pay into it, so prizes are never a pot of participants'
///         lost stakes (avoids maysir). Distribution is owner-operated off a public,
///         on-chain accuracy leaderboard from ForecastArena.
contract PrizePool {
    IERC20P public immutable token;
    address public owner;

    event Funded(address indexed from, uint256 amount);
    event PrizePaid(address indexed to, uint256 amount, uint256 indexed roundRef);
    event OwnerUpdated(address indexed owner);

    error NotOwner();
    error LengthMismatch();
    error InsufficientBalance();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _token) {
        token = IERC20P(_token);
        owner = msg.sender;
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    function fund(uint256 amount) external {
        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Funded(msg.sender, amount);
    }

    function distribute(address[] calldata winners, uint256[] calldata amounts, uint256 roundRef) external onlyOwner {
        if (winners.length != amounts.length) revert LengthMismatch();
        for (uint256 i = 0; i < winners.length; i++) {
            if (token.balanceOf(address(this)) < amounts[i]) revert InsufficientBalance();
            if (!token.transfer(winners[i], amounts[i])) revert TransferFailed();
            emit PrizePaid(winners[i], amounts[i], roundRef);
        }
    }

    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
