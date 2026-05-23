// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal interfaces for Arc's deployed ERC-8004 registries.
/// IdentityRegistry  : 0x8004A818BFB912233c491871b3d84c89A494BD9e
/// ReputationRegistry: 0x8004B663056A597Dffe9eCcC1965A193B7388713
interface IIdentityRegistry {
    function register(string calldata metadataURI) external;
    function ownerOf(uint256 tokenId) external view returns (address);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

interface IReputationRegistry {
    function giveFeedback(
        uint256 agentId,
        int128 score,
        uint8 feedbackType,
        string calldata tag,
        string calldata metadataURI,
        string calldata evidenceURI,
        string calldata comment,
        bytes32 feedbackHash
    ) external;
}
