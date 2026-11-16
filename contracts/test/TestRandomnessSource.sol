// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRandomnessSource, IRewardRandomReceiver} from "../interfaces/IRandomnessSource.sol";

/// @notice Test-only randomness. Do not deploy this on a public network.
contract TestRandomnessSource is IRandomnessSource {
    uint256 public nextRequestId = 1;
    address public lastRequester;

    function request(uint256) external returns (uint256 requestId) {
        lastRequester = msg.sender;
        requestId = nextRequestId++;
    }

    function fulfill(uint256 requestId, uint256 randomness) external {
        IRewardRandomReceiver(lastRequester).onRandomness(requestId, randomness);
    }

    function fulfillTo(address receiver, uint256 requestId, uint256 randomness) external {
        IRewardRandomReceiver(receiver).onRandomness(requestId, randomness);
    }
}
