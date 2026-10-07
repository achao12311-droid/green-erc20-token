// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title EcoToken
/// @notice ERC-20 with a fixed supply. New ECO is minted only from a signed record.
/// @dev 1000 grams in a signed record mint 1 ECO, and supply cannot pass {MAX_SUPPLY}.
contract EcoToken is ERC20, ERC20Permit, Ownable2Step {
    uint256 public constant BLOCK_INTERVAL = 60;
    uint256 public constant MAX_SUPPLY = 1_000_000 ether;
    /// @notice Whole grams required to mint 1 ECO. The caller does not choose the amount.
    uint256 public constant GRAMS_PER_ECO = 1000;

    error NoStake();
    error BlockTooEarly(uint256 nextTime);
    error InsufficientStake(uint256 requested, uint256 staked);
    error MaxSupplyExceeded(uint256 requested, uint256 maxSupply);
    error ActionAlreadyUsed(uint256 actionId);
    error InvalidAttester(address signer);
    error ZeroGrams();

    struct PoSBlock {
        uint256 height;
        uint256 timestamp;
        address producer;
    }

    mapping(address => uint256) public staked;
    uint256 public lastBlockTime;
    uint256 public height;
    mapping(uint256 => PoSBlock) public blocks;
    mapping(uint256 => bool) public usedActions;

    event Staked(address indexed account, uint256 amount);
    event Unstaked(address indexed account, uint256 amount);
    event BlockProduced(uint256 indexed height, uint256 timestamp, address indexed producer);
    event Minted(uint256 indexed actionId, address indexed to, uint256 grams, uint256 amount);

    constructor(uint256 initialSupply) ERC20("EcoToken", "ECO") ERC20Permit("EcoToken") Ownable(msg.sender) {
        if (initialSupply > MAX_SUPPLY) revert MaxSupplyExceeded(initialSupply, MAX_SUPPLY);
        lastBlockTime = block.timestamp - BLOCK_INTERVAL;
        if (initialSupply > 0) {
            _mint(msg.sender, initialSupply);
        }
    }

    /// @notice The address that must sign mint records. It changes only when ownership is accepted.
    function attester() public view returns (address) {
        return owner();
    }

    function stake(uint256 amount) external {
        _transfer(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external {
        uint256 locked = staked[msg.sender];
        if (locked < amount) revert InsufficientStake(amount, locked);
        staked[msg.sender] = locked - amount;
        _transfer(address(this), msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    /// @notice Record a timestamp. This does not mint ECO.
    function produceBlock() external {
        if (staked[msg.sender] == 0) revert NoStake();
        uint256 nextTime = lastBlockTime + BLOCK_INTERVAL;
        if (block.timestamp < nextTime) revert BlockTooEarly(nextTime);
        uint256 newHeight = height + 1;
        height = newHeight;
        lastBlockTime = block.timestamp;
        blocks[newHeight] = PoSBlock({height: newHeight, timestamp: block.timestamp, producer: msg.sender});
        emit BlockProduced(newHeight, block.timestamp, msg.sender);
    }

    /// @notice Mint ECO for a record the attester has signed. 1000 grams mint 1 ECO.
    /// @param actionId Unique id of the off-chain record. Reuse reverts.
    /// @param grams Measured grams from that record. This sets the minted amount.
    function mintWithAttestation(
        address to,
        uint256 actionId,
        uint256 grams,
        uint256 nonce,
        bytes calldata signature
    ) external {
        if (usedActions[actionId]) revert ActionAlreadyUsed(actionId);
        if (grams == 0) revert ZeroGrams();

        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode(address(this), to, actionId, grams, nonce))
        );
        address signer = ECDSA.recover(digest, signature);
        if (signer != attester()) revert InvalidAttester(signer);

        uint256 amount = (grams * 1 ether) / GRAMS_PER_ECO;
        uint256 nextSupply = totalSupply() + amount;
        if (nextSupply > MAX_SUPPLY) revert MaxSupplyExceeded(nextSupply, MAX_SUPPLY);

        usedActions[actionId] = true;
        _mint(to, amount);
        emit Minted(actionId, to, grams, amount);
    }
}
