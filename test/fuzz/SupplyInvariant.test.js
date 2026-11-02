const { expect } = require("chai");
const { ethers } = require("hardhat");
const { signMint, submissionId } = require("../helpers/sign");

describe("supply invariant", function () {
  it("keeps the sum of attested rewards inside the cap", async function () {
    const [attester, alice] = await ethers.getSigners();
    const token = await ethers.deployContract("EcoToken", [0]);
    let supply = 0n;
    for (let i = 0; i < 20; i++) {
      const whole = BigInt((i * 17) % 9) + 1n;
      const reward = ethers.parseEther(whole.toString());
      const signed = await signMint(attester, token, alice.address, submissionId("fuzz-" + i), reward, BigInt(i + 1));
      await token.mintWithAttestation(
        alice.address,
        signed.submissionId,
        reward,
        BigInt(i + 1),
        signed.deadline,
        signed.recordHash,
        signed.signature
      );
      supply += reward;
      expect(await token.totalSupply()).to.equal(supply);
      expect(supply).to.be.lte(await token.MAX_SUPPLY());
    }
    expect(await token.balanceOf(alice.address)).to.equal(supply);
  });
});