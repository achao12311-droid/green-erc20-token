// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRandomnessSource, IRewardRandomReceiver} from "../interfaces/IRandomnessSource.sol";

/// @title EcoRewardManager
/// @notice Locks ECO as a giveaway entry and records winners.
/// @dev The ECO is returned after the campaign. CS2 skin delivery is off-chain and is not performed here.
///      Winner selection is only as fair as the configured randomness source. The test source is not VRF.
contract EcoRewardManager is Ownable2Step, ReentrancyGuard, IRewardRandomReceiver {
    using SafeERC20 for IERC20;

    enum Status {
        Active,
        Closed,
        Completed,
        Cancelled
    }

    struct Campaign {
        uint64 start;
        uint64 end;
        uint256 lockAmount;
        uint32 maxEntriesPerUser;
        uint32 winnerCount;
        Status status;
        uint256 randomRequestId;
        uint256 randomWord;
    }

    IERC20 public immutable eco;
    IRandomnessSource public randomnessSource;
    uint256 public nextCampaignId = 1;

    mapping(uint256 campaignId => Campaign campaign) public campaigns;
    mapping(uint256 campaignId => address[] entrants) private _entries;
    mapping(uint256 campaignId => mapping(address account => uint256 count)) public entryCount;
    mapping(uint256 campaignId => mapping(address account => uint256 amount)) public lockedOf;
    mapping(uint256 campaignId => uint256 amount) public totalLocked;
    mapping(uint256 campaignId => address[] winners) private _winners;
    mapping(uint256 campaignId => mapping(address account => bool won)) public isWinner;
    mapping(uint256 requestId => uint256 campaignId) public campaignOfRequest;

    error ZeroAddress();
    error InvalidWindow();
    error InvalidRules();
    error NotActive();
    error EntryLimit();
    error NotCloseable();
    error NotWithdrawable();
    error ZeroAmount();
    error InvalidRandomnessSource();
    error UnknownRequest(uint256 requestId);
    error AlreadyDrawn();
    error UnknownCampaign(uint256 campaignId);

    event CampaignCreated(uint256 indexed campaignId, uint64 start, uint64 end, uint256 lockAmount);
    event Entered(uint256 indexed campaignId, address indexed account, uint256 amount);
    event CampaignClosed(uint256 indexed campaignId, uint256 requestId);
    event WinnersSelected(uint256 indexed campaignId, address[] winners);
    event Withdrawn(uint256 indexed campaignId, address indexed account, uint256 amount);
    event CampaignCancelled(uint256 indexed campaignId);
    event RandomnessSourceUpdated(address indexed source);

    constructor(IERC20 ecoToken, IRandomnessSource source) Ownable(msg.sender) {
        if (address(ecoToken) == address(0) || address(source) == address(0)) revert ZeroAddress();
        eco = ecoToken;
        randomnessSource = source;
    }

    function setRandomnessSource(IRandomnessSource source) external onlyOwner {
        if (address(source) == address(0)) revert ZeroAddress();
        randomnessSource = source;
        emit RandomnessSourceUpdated(address(source));
    }

    function createCampaign(
        uint64 start,
        uint64 end,
        uint256 lockAmount,
        uint32 maxEntriesPerUser,
        uint32 winnerCount
    ) external onlyOwner returns (uint256 campaignId) {
        if (end <= start) revert InvalidWindow();
        if (lockAmount == 0 || maxEntriesPerUser == 0 || winnerCount == 0) revert InvalidRules();
        campaignId = nextCampaignId++;
        campaigns[campaignId] = Campaign({
            start: start,
            end: end,
            lockAmount: lockAmount,
            maxEntriesPerUser: maxEntriesPerUser,
            winnerCount: winnerCount,
            status: Status.Active,
            randomRequestId: 0,
            randomWord: 0
        });
        emit CampaignCreated(campaignId, start, end, lockAmount);
    }

    function enter(uint256 campaignId) external nonReentrant {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.lockAmount == 0) revert UnknownCampaign(campaignId);
        if (campaign.status != Status.Active) revert NotActive();
        if (block.timestamp < campaign.start || block.timestamp >= campaign.end) revert NotActive();
        if (entryCount[campaignId][msg.sender] >= campaign.maxEntriesPerUser) revert EntryLimit();

        uint256 amount = campaign.lockAmount;
        entryCount[campaignId][msg.sender] += 1;
        lockedOf[campaignId][msg.sender] += amount;
        totalLocked[campaignId] += amount;
        _entries[campaignId].push(msg.sender);
        eco.safeTransferFrom(msg.sender, address(this), amount);
        emit Entered(campaignId, msg.sender, amount);
    }

    function close(uint256 campaignId) external onlyOwner {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.lockAmount == 0) revert UnknownCampaign(campaignId);
        if (campaign.status != Status.Active || block.timestamp < campaign.end) revert NotCloseable();
        campaign.status = Status.Closed;
        uint256 requestId = randomnessSource.request(campaignId);
        campaign.randomRequestId = requestId;
        campaignOfRequest[requestId] = campaignId;
        emit CampaignClosed(campaignId, requestId);
    }

    function onRandomness(uint256 requestId, uint256 randomness) external {
        if (msg.sender != address(randomnessSource)) revert InvalidRandomnessSource();
        uint256 campaignId = campaignOfRequest[requestId];
        if (campaignId == 0) revert UnknownRequest(requestId);
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.status != Status.Closed || campaign.randomRequestId != requestId) revert AlreadyDrawn();
        campaign.randomWord = randomness;
        campaign.status = Status.Completed;
        _selectWinners(campaignId, randomness);
        emit WinnersSelected(campaignId, _winners[campaignId]);
    }

    function cancel(uint256 campaignId) external onlyOwner {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.lockAmount == 0) revert UnknownCampaign(campaignId);
        if (campaign.status != Status.Active) revert NotActive();
        campaign.status = Status.Cancelled;
        emit CampaignCancelled(campaignId);
    }

    function withdraw(uint256 campaignId) external nonReentrant {
        Status status = campaigns[campaignId].status;
        if (status != Status.Completed && status != Status.Cancelled) revert NotWithdrawable();
        uint256 amount = lockedOf[campaignId][msg.sender];
        if (amount == 0) revert ZeroAmount();
        lockedOf[campaignId][msg.sender] = 0;
        totalLocked[campaignId] -= amount;
        eco.safeTransfer(msg.sender, amount);
        emit Withdrawn(campaignId, msg.sender, amount);
    }

    function entries(uint256 campaignId) external view returns (address[] memory) {
        return _entries[campaignId];
    }

    function winners(uint256 campaignId) external view returns (address[] memory) {
        return _winners[campaignId];
    }

    function _selectWinners(uint256 campaignId, uint256 word) internal {
        address[] storage pool = _entries[campaignId];
        uint256 size = pool.length;
        uint256 want = campaigns[campaignId].winnerCount;
        if (size == 0 || want == 0) return;
        if (want > size) want = size;
        uint256 picked = 0;
        uint256 limit = size * 2;
        for (uint256 salt = 0; picked < want && salt < limit; salt++) {
            uint256 index = uint256(keccak256(abi.encode(word, salt))) % size;
            address candidate = pool[index];
            if (isWinner[campaignId][candidate]) continue;
            isWinner[campaignId][candidate] = true;
            _winners[campaignId].push(candidate);
            picked++;
        }
    }
}
