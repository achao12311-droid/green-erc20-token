const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { signMint, submissionId, recordHash, MINT_TYPES } = require("../helpers/sign");

const MAX_SUPPLY = ethers.parseEther("1000000");

describe("mint security", function () {
  async function deploy() {
    const [deployer, alice] = await ethers.getSigners();
    const token = await ethers.deployContract("EcoToken", [0, deployer.address]);
    await token.waitForDeployment();
    return { token, deployer, alice };
  }

  async function mint(token, signer, to, label, reward, nonce) {
    const signed = await signMint(signer, token, to, submissionId(label), reward, nonce);
    await token.mintWithAttestation(to, signed.submissionId, reward, nonce, signed.deadline, signed.recordHash, signed.signature);
    return signed;
  }

  it("rejects a reused submission, a reused nonce, and an outsider signature", async function () {
    const { token, deployer, alice } = await deploy();
    const reward = ethers.parseEther("1");
    const first = await mint(token, deployer, alice.address, "one", reward, 1n);

    await expect(
      token.mintWithAttestation(alice.address, first.submissionId, reward, 1n, first.deadline, first.recordHash, first.signature)
    )
      .to.be.revertedWithCustomError(token, "SubmissionAlreadyUsed")
      .withArgs(first.submissionId);

    const reusedNonce = await signMint(deployer, token, alice.address, submissionId("two"), reward, 1n);
    await expect(
      token.mintWithAttestation(
        alice.address,
        reusedNonce.submissionId,
        reward,
        1n,
        reusedNonce.deadline,
        reusedNonce.recordHash,
        reusedNonce.signature
      )
    )
      .to.be.revertedWithCustomError(token, "NonceAlreadyUsed")
      .withArgs(deployer.address, 1n);

    const outsider = await signMint(alice, token, alice.address, submissionId("three"), reward, 1n);
    await expect(
      token.mintWithAttestation(
        alice.address,
        outsider.submissionId,
        reward,
        1n,
        outsider.deadline,
        outsider.recordHash,
        outsider.signature
      )
    )
      .to.be.revertedWithCustomError(token, "InvalidAttester")
      .withArgs(alice.address);
  });

  it("stops at the cap and rejects expired, cross-chain, empty, and self mints", async function () {
    const { token, deployer, alice } = await deploy();
    const nearCap = MAX_SUPPLY - ethers.parseEther("1");
    await mint(token, deployer, alice.address, "fill", nearCap, 1n);
    await mint(token, deployer, alice.address, "last", ethers.parseEther("1"), 2n);
    expect(await token.totalSupply()).to.equal(MAX_SUPPLY);

    const over = await signMint(deployer, token, alice.address, submissionId("over"), 1n, 3n);
    await expect(
      token.mintWithAttestation(alice.address, over.submissionId, 1n, 3n, over.deadline, over.recordHash, over.signature)
    )
      .to.be.revertedWithCustomError(token, "MaxSupplyExceeded")
      .withArgs(MAX_SUPPLY + 1n, MAX_SUPPLY);

    const now = BigInt(await time.latest());
    const expired = await signMint(deployer, token, alice.address, submissionId("old"), 1n, 4n, now);
    await time.setNextBlockTimestamp(now + 1n);
    await expect(
      token.mintWithAttestation(alice.address, expired.submissionId, 1n, 4n, expired.deadline, expired.recordHash, expired.signature)
    )
      .to.be.revertedWithCustomError(token, "SignatureExpired")
      .withArgs(now);

    const networkDeadline = now + 3600n;
    const wrongChain = await deployer.signTypedData(
      { name: "Green Eco Token", version: "1", chainId: 1n, verifyingContract: await token.getAddress() },
      MINT_TYPES,
      {
        to: alice.address,
        submissionId: submissionId("mainnet"),
        rewardAmount: 1n,
        nonce: 5n,
        deadline: networkDeadline,
        recordHash: recordHash("review-record"),
      }
    );
    await expect(
      token.mintWithAttestation(
        alice.address,
        submissionId("mainnet"),
        1n,
        5n,
        networkDeadline,
        recordHash("review-record"),
        wrongChain
      )
    ).to.be.revertedWithCustomError(token, "InvalidAttester");

    const empty = await signMint(deployer, token, alice.address, submissionId("empty"), 0n, 6n);
    await expect(
      token.mintWithAttestation(alice.address, empty.submissionId, 0n, 6n, empty.deadline, empty.recordHash, empty.signature)
    ).to.be.revertedWithCustomError(token, "ZeroReward");

    const toSelf = await signMint(deployer, token, await token.getAddress(), submissionId("self"), 1n, 7n);
    await expect(
      token.mintWithAttestation(
        await token.getAddress(),
        toSelf.submissionId,
        1n,
        7n,
        toSelf.deadline,
        toSelf.recordHash,
        toSelf.signature
      )
    ).to.be.revertedWithCustomError(token, "MintToContract");

    const noRecord = await signMint(deployer, token, alice.address, submissionId("blank"), 1n, 8n, undefined, ethers.ZeroHash);
    await expect(
      token.mintWithAttestation(
        alice.address,
        noRecord.submissionId,
        1n,
        8n,
        noRecord.deadline,
        noRecord.recordHash,
        noRecord.signature
      )
    ).to.be.revertedWithCustomError(token, "InvalidRecord");
  });
});
