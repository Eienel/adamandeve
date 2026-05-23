// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IIdentityRegistry, IReputationRegistry} from "./interfaces/IERC8004.sol";

/// @title ForecastArena
/// @notice Open competition engine where autonomous agents submit price forecasts.
///         Entry is free (no stake, no pot funded by participants) — the competition
///         is settled against an observed truth price and the most accurate agent wins.
///         Accuracy is pushed to Arc's ERC-8004 ReputationRegistry. This contract is a
///         neutral attestor (not an agent owner), satisfying ERC-8004 non-self-dealing.
/// @dev    No participant funds ever flow into a prize pot here (avoids maysir). Prizes,
///         if any, are paid separately by PrizePool from treasury/sponsor funds (ju'ala).
contract ForecastArena {
    enum Mode {
        SpotClose, // predict a reference feed price at close
        TradeImpact // predict the execution price of a real on-chain swap
    }

    struct Round {
        uint64 openTs;
        uint64 closeTs;
        Mode mode;
        bool settled;
        uint256 truthPrice;
        address winner;
        uint256 winnerError;
        uint32 numForecasts;
        string subject;
    }

    struct Forecast {
        uint256 value;
        bytes32 traceHash;
        uint256 agentId;
        bool exists;
        bool reputationPushed;
    }

    address public owner;
    address public resolver;
    IIdentityRegistry public identityRegistry;
    IReputationRegistry public reputationRegistry;

    uint256 public roundCount;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => Forecast)) internal _forecasts;
    mapping(uint256 => address[]) internal _participants;

    mapping(address => uint256) public roundsPlayed;
    mapping(address => uint256) public wins;

    event RoundOpened(uint256 indexed roundId, Mode mode, uint64 closeTs, string subject);
    event ForecastCommitted(uint256 indexed roundId, address indexed agent, uint256 indexed agentId, bytes32 traceHash);
    event RoundSettled(
        uint256 indexed roundId, uint256 truthPrice, address indexed winner, uint256 winnerError, uint32 numForecasts
    );
    event ReputationPushed(uint256 indexed roundId, address indexed agent, uint256 indexed agentId, int128 score);
    event ResolverUpdated(address indexed resolver);
    event RegistriesUpdated(address identityRegistry, address reputationRegistry);

    error NotOwner();
    error NotResolver();
    error RoundClosed();
    error RoundNotClosed();
    error AlreadySettled();
    error NotSettled();
    error AlreadyForecast();
    error NoForecast();
    error BadAgentId();
    error CloseInPast();
    error AlreadyPushed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyResolver() {
        if (msg.sender != resolver) revert NotResolver();
        _;
    }

    constructor(address _resolver, address _identityRegistry, address _reputationRegistry) {
        owner = msg.sender;
        resolver = _resolver == address(0) ? msg.sender : _resolver;
        identityRegistry = IIdentityRegistry(_identityRegistry);
        reputationRegistry = IReputationRegistry(_reputationRegistry);
    }

    function setResolver(address _resolver) external onlyOwner {
        resolver = _resolver;
        emit ResolverUpdated(_resolver);
    }

    function setRegistries(address _identityRegistry, address _reputationRegistry) external onlyOwner {
        identityRegistry = IIdentityRegistry(_identityRegistry);
        reputationRegistry = IReputationRegistry(_reputationRegistry);
        emit RegistriesUpdated(_identityRegistry, _reputationRegistry);
    }

    /// @notice Open a new forecasting round. Resolver-operated.
    function openRound(Mode mode, uint64 closeTs, string calldata subject)
        external
        onlyResolver
        returns (uint256 roundId)
    {
        if (closeTs <= block.timestamp) revert CloseInPast();
        roundId = ++roundCount;
        Round storage r = rounds[roundId];
        r.openTs = uint64(block.timestamp);
        r.closeTs = closeTs;
        r.mode = mode;
        r.subject = subject;
        emit RoundOpened(roundId, mode, closeTs, subject);
    }

    /// @notice Submit a forecast. Free entry. The committed value is NOT emitted and is
    ///         hidden behind a getter until settlement, so peers cannot copy it live.
    ///         `traceHash` anchors the agent's reasoning (provenance) at submission time.
    /// @param agentId Optional ERC-8004 identity tokenId; if set and an IdentityRegistry is
    ///        configured, msg.sender must own it.
    function submitForecast(uint256 roundId, uint256 value, bytes32 traceHash, uint256 agentId) external {
        Round storage r = rounds[roundId];
        if (r.closeTs == 0 || block.timestamp >= r.closeTs) revert RoundClosed();

        Forecast storage f = _forecasts[roundId][msg.sender];
        if (f.exists) revert AlreadyForecast();

        if (address(identityRegistry) != address(0) && agentId != 0) {
            if (identityRegistry.ownerOf(agentId) != msg.sender) revert BadAgentId();
        }

        f.value = value;
        f.traceHash = traceHash;
        f.agentId = agentId;
        f.exists = true;

        _participants[roundId].push(msg.sender);
        unchecked {
            r.numForecasts += 1;
            roundsPlayed[msg.sender] += 1;
        }

        emit ForecastCommitted(roundId, msg.sender, agentId, traceHash);
    }

    /// @notice Settle a round against the observed truth price and select the winner.
    function settle(uint256 roundId, uint256 truthPrice) external onlyResolver {
        Round storage r = rounds[roundId];
        if (r.closeTs == 0) revert RoundClosed();
        if (block.timestamp < r.closeTs) revert RoundNotClosed();
        if (r.settled) revert AlreadySettled();

        r.settled = true;
        r.truthPrice = truthPrice;

        address[] storage ps = _participants[roundId];
        uint256 n = ps.length;
        if (n == 0) {
            emit RoundSettled(roundId, truthPrice, address(0), 0, 0);
            return;
        }

        address best;
        uint256 bestErr = type(uint256).max;
        for (uint256 i = 0; i < n; i++) {
            address a = ps[i];
            uint256 v = _forecasts[roundId][a].value;
            uint256 err = v > truthPrice ? v - truthPrice : truthPrice - v;
            if (err < bestErr) {
                bestErr = err;
                best = a;
            }
        }

        r.winner = best;
        r.winnerError = bestErr;
        unchecked {
            wins[best] += 1;
        }

        emit RoundSettled(roundId, truthPrice, best, bestErr, uint32(n));
    }

    /// @notice Push an agent's accuracy for a settled round to ERC-8004 reputation.
    ///         Permissionless and idempotent per (round, agent).
    function pushReputation(uint256 roundId, address agent) external {
        Round storage r = rounds[roundId];
        if (!r.settled) revert NotSettled();

        Forecast storage f = _forecasts[roundId][agent];
        if (!f.exists) revert NoForecast();
        if (f.reputationPushed) revert AlreadyPushed();
        f.reputationPushed = true;

        int128 score = _score(f.value, r.truthPrice, agent == r.winner);

        if (address(reputationRegistry) != address(0) && f.agentId != 0) {
            bytes32 fh = keccak256(abi.encodePacked(roundId, agent, f.value, r.truthPrice));
            reputationRegistry.giveFeedback(f.agentId, score, 0, "forecast_accuracy", "", "", "", fh);
        }

        emit ReputationPushed(roundId, agent, f.agentId, score);
    }

    /// @dev Map accuracy to a 0..100 reputation score.
    function _score(uint256 value, uint256 truth, bool isWinner) internal pure returns (int128) {
        if (isWinner) return 100;
        if (truth == 0) return 50;
        uint256 err = value > truth ? value - truth : truth - value;
        uint256 relBps = (err * 10_000) / truth; // relative error in basis points
        if (relBps >= 10_000) return 0;
        uint256 s = 100 - (relBps * 100) / 10_000;
        return int128(uint128(s));
    }

    // --- views (anti-copy: value hidden until settlement) ---

    function getCommitment(uint256 roundId, address agent)
        external
        view
        returns (bytes32 traceHash, uint256 agentId, bool exists)
    {
        Forecast storage f = _forecasts[roundId][agent];
        return (f.traceHash, f.agentId, f.exists);
    }

    function getForecastValue(uint256 roundId, address agent) external view returns (uint256) {
        Round storage r = rounds[roundId];
        if (!r.settled) revert NotSettled();
        Forecast storage f = _forecasts[roundId][agent];
        if (!f.exists) revert NoForecast();
        return f.value;
    }

    function getParticipants(uint256 roundId) external view returns (address[] memory) {
        return _participants[roundId];
    }
}
