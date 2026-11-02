// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRandomnessSource} from "../interfaces/IRandomnessSource.sol";

/// @notice Deployed when Chainlink VRF is not configured. It cannot draw winners.
contract UnconfiguredRandomness is IRandomnessSource {
    error RandomnessNotConfigured();

    function request(uint256) external pure returns (uint256) {
        revert RandomnessNotConfigured();
    }
}
