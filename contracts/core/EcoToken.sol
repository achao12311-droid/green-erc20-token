// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title EcoToken
/// @notice Capped ERC-20. New ECO is minted only from an authorized attestation.
/// @dev Staking lives in EcoStaking. This token does not run Ethereum consensus.
contract EcoToken is ERC20, ERC20Permit, Ownable2Step, ReentrancyGuard {
    uint256 public constant MAX_SUPPLY = 1_000_000 ether;

    bytes32 private constant MINT_TYPEHASH = keccak256(
        "Mint(address to,bytes32 submissionId,uint256 rewardAmount,uint256 nonce,uint256 deadline,bytes32 recordHash)"
    );

    mapping(address attester => bool allowed) public isAttester;
    mapping(bytes32 submissionId => bool used) public usedSubmissions;
    mapping(address attester => mapping(uint256 nonce => bool used)) public usedNonces;
    mapping(bytes32 submissionId => bytes32 recordHash) public recordHashes;
    bool public mintPaused;

    error MaxSupplyExceeded(uint256 requested, uint256 maxSupply);
    error SubmissionAlreadyUsed(bytes32 submissionId);
    error NonceAlreadyUsed(address attester, uint256 nonce);
    error InvalidAttester(address signer);
    error ZeroReward();
    error ZeroAddress();
    error SignatureExpired(uint256 deadline);
    error MintToContract();
    error DirectTransferToContract();
    error InvalidRecord();
    error MintingPaused();
    error AttesterUnchanged(address attester, bool allowed);

    event AttesterUpdated(address indexed attester, bool allowed);
    event MintPaused();
    event MintUnpaused();
    event Minted(
        bytes32 indexed submissionId,
        address indexed to,
        uint256 rewardAmount,
        bytes32 recordHash,
        address indexed attester
    );

    constructor(uint256 initialSupply) ERC20("Green Eco Token", "ECO") ERC20Permit("Green Eco Token") Ownable(msg.sender) {
        if (initialSupply >= MAX_SUPPLY) revert MaxSupplyExceeded(initialSupply, MAX_SUPPLY);
        isAttester[msg.sender] = true;
        emit AttesterUpdated(msg.sender, true);
        if (initialSupply > 0) {
            _mint(msg.sender, initialSupply);
        }
    }

    function grantAttester(address attester) external onlyOwner {
        if (attester == address(0)) revert ZeroAddress();
        if (isAttester[attester]) revert AttesterUnchanged(attester, true);
        isAttester[attester] = true;
        emit AttesterUpdated(attester, true);
    }

    function revokeAttester(address attester) external onlyOwner {
        if (!isAttester[attester]) revert AttesterUnchanged(attester, false);
        isAttester[attester] = false;
        emit AttesterUpdated(attester, false);
    }

    /// @notice Stops new attestation mints. Transfers stay open so balances cannot be frozen.
    function pauseMinting() external onlyOwner {
        mintPaused = true;
        emit MintPaused();
    }

    function unpauseMinting() external onlyOwner {
        mintPaused = false;
        emit MintUnpaused();
    }

    /// @param rewardAmount ECO wei authorized by the attester. The contract does not convert eco points.
    /// @param recordHash keccak256 of the off-chain review record. It must not be zero.
    function mintWithAttestation(
        address to,
        bytes32 submissionId,
        uint256 rewardAmount,
        uint256 nonce,
        uint256 deadline,
        bytes32 recordHash,
        bytes calldata signature
    ) external nonReentrant {
        if (mintPaused) revert MintingPaused();
        if (to == address(0)) revert ZeroAddress();
        if (to == address(this)) revert MintToContract();
        if (rewardAmount == 0) revert ZeroReward();
        if (recordHash == bytes32(0)) revert InvalidRecord();
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        if (usedSubmissions[submissionId]) revert SubmissionAlreadyUsed(submissionId);

        bytes32 structHash = keccak256(
            abi.encode(MINT_TYPEHASH, to, submissionId, rewardAmount, nonce, deadline, recordHash)
        );
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        if (!isAttester[signer]) revert InvalidAttester(signer);
        if (usedNonces[signer][nonce]) revert NonceAlreadyUsed(signer, nonce);

        uint256 nextSupply = totalSupply() + rewardAmount;
        if (nextSupply > MAX_SUPPLY) revert MaxSupplyExceeded(nextSupply, MAX_SUPPLY);

        usedSubmissions[submissionId] = true;
        usedNonces[signer][nonce] = true;
        recordHashes[submissionId] = recordHash;
        _mint(to, rewardAmount);
        emit Minted(submissionId, to, rewardAmount, recordHash, signer);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (to == address(this)) revert DirectTransferToContract();
        super._update(from, to, value);
    }
}
