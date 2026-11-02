// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Requests randomness for a giveaway. Production must use a configured VRF source.
interface IRandomnessSource {
    function request(uint256 campaignId) external returns (uint256 requestId);
}

interface IRewardRandomReceiver {
    function onRandomness(uint256 requestId, uint256 randomness) external;
}
