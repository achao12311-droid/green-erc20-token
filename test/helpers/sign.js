const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const MINT_TYPES = {
  Mint: [
    { name: "to", type: "address" },
    { name: "submissionId", type: "bytes32" },
    { name: "rewardAmount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "recordHash", type: "bytes32" },
  ],
};

function submissionId(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(String(label)));
}

function recordHash(text) {
  return ethers.keccak256(ethers.toUtf8Bytes(text));
}

async function signMint(signer, token, to, submission, rewardAmount, nonce, deadline, hash) {
  const resolvedDeadline = deadline === undefined ? BigInt(await time.latest()) + 3600n : deadline;
  const resolvedHash = hash === undefined ? recordHash("review-record") : hash;
  const network = await ethers.provider.getNetwork();
  const signature = await signer.signTypedData(
    {
      name: "Green Eco Token",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await token.getAddress(),
    },
    MINT_TYPES,
    {
      to,
      submissionId: submission,
      rewardAmount,
      nonce,
      deadline: resolvedDeadline,
      recordHash: resolvedHash,
    }
  );
  return { signature, deadline: resolvedDeadline, recordHash: resolvedHash, submissionId: submission };
}

module.exports = { MINT_TYPES, submissionId, recordHash, signMint };
