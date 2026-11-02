const { expect } = require("chai");
const { ethers } = require("hardhat");
const { signMint, submissionId } = require("../helpers/sign");

describe("mint and stake", function () {
  it("stakes ECO that was minted from an attestation", async function () {
    const [attester, alice] = await ethers.getSigners();
    const token = await ethers.deployContract("EcoToken", [0]);
    const staking = await ethers.deployContract("EcoStaking", [await token.getAddress()]);
    const reward = ethers.parseEther("8");
    const signed = await signMint(attester, token, alice.address, submissionId("integration"), reward, 1n);
    await token.mintWithAttestation(
      alice.address,
      signed.submissionId,
      reward,
      1n,
      signed.deadline,
      signed.recordHash,
      signed.signature
    );

    await token.connect(alice).approve(await staking.getAddress(), reward);
    await staking.connect(alice).stake(reward);
    expect(await staking.staked(alice.address)).to.equal(reward);
    expect(await token.balanceOf(alice.address)).to.equal(0n);
    await staking.connect(alice).unstake(reward);
    expect(await token.balanceOf(alice.address)).to.equal(reward);
  });
});
