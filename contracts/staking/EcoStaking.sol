// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title EcoStaking
/// @notice Application-level ECO lock. It does not stake on Ethereum and it pays no yield.
contract EcoStaking is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable eco;
    uint256 public totalStaked;
    bool public stakePaused;

    mapping(address account => uint256 amount) public staked;

    error ZeroAmount();
    error ZeroAddress();
    error InsufficientStake(uint256 requested, uint256 available);
    error StakingPaused();

    event Staked(address indexed account, uint256 amount);
    event Unstaked(address indexed account, uint256 amount);
    event StakePaused();
    event StakeUnpaused();
    event ExcessRecovered(address indexed to, uint256 amount);

    constructor(IERC20 ecoToken) Ownable(msg.sender) {
        if (address(ecoToken) == address(0)) revert ZeroAddress();
        eco = ecoToken;
    }

    function pauseStake() external onlyOwner {
        stakePaused = true;
        emit StakePaused();
    }

    function unpauseStake() external onlyOwner {
        stakePaused = false;
        emit StakeUnpaused();
    }

    function stake(uint256 amount) external nonReentrant {
        if (stakePaused) revert StakingPaused();
        if (amount == 0) revert ZeroAmount();
        staked[msg.sender] += amount;
        totalStaked += amount;
        eco.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 locked = staked[msg.sender];
        if (locked < amount) revert InsufficientStake(amount, locked);
        staked[msg.sender] = locked - amount;
        totalStaked -= amount;
        eco.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    /// @notice Returns ECO that was transferred here without stake(). It cannot take locked stake.
    function recoverExcess(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 excess = eco.balanceOf(address(this)) - totalStaked;
        if (excess == 0) revert ZeroAmount();
        eco.safeTransfer(to, excess);
        emit ExcessRecovered(to, excess);
    }
}
