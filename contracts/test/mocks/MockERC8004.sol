// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Local stand-ins for Arc's ERC-8004 registries (for Foundry tests only).
contract MockIdentityRegistry {
    uint256 public nextId = 1;
    mapping(uint256 => address) public owners;
    mapping(uint256 => string) public uris;

    // Mirror the real ERC-8004 IdentityRegistry: minting an identity emits ERC-721 Transfer.
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function register(string calldata metadataURI) external {
        uint256 id = nextId++;
        owners[id] = msg.sender;
        uris[id] = metadataURI;
        emit Transfer(address(0), msg.sender, id);
    }

    /// @dev test helper to assign an id to an owner directly
    function mintTo(address to, string calldata metadataURI) external returns (uint256 id) {
        id = nextId++;
        owners[id] = to;
        uris[id] = metadataURI;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return owners[tokenId];
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        return uris[tokenId];
    }
}

contract MockReputationRegistry {
    struct Feedback {
        uint256 agentId;
        int128 score;
        uint8 feedbackType;
        string tag;
        bytes32 feedbackHash;
        address from;
    }

    Feedback[] public feedbacks;

    function giveFeedback(
        uint256 agentId,
        int128 score,
        uint8 feedbackType,
        string calldata tag,
        string calldata,
        string calldata,
        string calldata,
        bytes32 feedbackHash
    ) external {
        feedbacks.push(Feedback(agentId, score, feedbackType, tag, feedbackHash, msg.sender));
    }

    function count() external view returns (uint256) {
        return feedbacks.length;
    }

    function lastScore() external view returns (int128) {
        return feedbacks[feedbacks.length - 1].score;
    }

    function lastAgentId() external view returns (uint256) {
        return feedbacks[feedbacks.length - 1].agentId;
    }
}
