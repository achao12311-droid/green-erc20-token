const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EcoRewardManager", function () {
  async function deploy() {
    const [owner, alice, bob] = await ethers.getSigners();
    const token = await ethers.deployContract("EcoToken", [ethers.parseEther("100"), owner.address]);
    const random = await ethers.deployContract("TestRandomnessSource");
    const manager = await ethers.deployContract("EcoRewardManager", [await token.getAddress(), await random.getAddress()]);
    await manager.waitForDeployment();
    const lock = ethers.parseEther("2");
    await token.transfer(alice.address, ethers.parseEther("10"));
    await token.transfer(bob.address, ethers.parseEther("10"));
    await token.connect(alice).approve(await manager.getAddress(), ethers.parseEther("10"));
    await token.connect(bob).approve(await manager.getAddress(), ethers.parseEther("10"));
    return { token, random, manager, owner, alice, bob, lock };
  }

  it("sells a ticket, draws a winner, and keeps the spent ECO", async function () {
    const { token, random, manager, owner, alice, bob, lock } = await deploy();
    const start = BigInt(await time.latest());
    const end = start + 100n;
    await manager.createCampaign(start, end, lock, 1, 1);
    await manager.connect(alice).enter(1);
    await manager.connect(bob).enter(1);
    await expect(manager.connect(alice).enter(1)).to.be.revertedWithCustomError(manager, "EntryLimit");

    await time.setNextBlockTimestamp(end);
    await manager.close(1);
    await random.fulfill(1, 1);
    const winners = await manager.winners(1);
    expect(winners.length).to.equal(1);
    await expect(manager.connect(alice).withdraw(1)).to.be.revertedWithCustomError(manager, "NotWithdrawable");

    const ownerBefore = await token.balanceOf(owner.address);
    await manager.collectTickets(1, owner.address);
    expect(await token.balanceOf(owner.address)).to.equal(ownerBefore + lock * 2n);
    expect(await manager.totalLocked(1)).to.equal(0n);
  });

  it("refuses to close before the end and refuses the unconfigured source", async function () {
    const { manager, alice, lock } = await deploy();
    const start = BigInt(await time.latest());
    const end = start + 50n;
    await manager.createCampaign(start, end, lock, 1, 1);
    await manager.connect(alice).enter(1);
    await expect(manager.close(1)).to.be.revertedWithCustomError(manager, "NotCloseable");

    const blocked = await ethers.deployContract("UnconfiguredRandomness");
    await manager.setRandomnessSource(await blocked.getAddress());
    await time.setNextBlockTimestamp(end);
    await expect(manager.close(1)).to.be.revertedWithCustomError(blocked, "RandomnessNotConfigured");
    expect((await manager.campaigns(1)).status).to.equal(0n);
  });

  it("accepts the original randomness source after the configured source changes", async function () {
    const { random, manager, owner, alice, bob, lock } = await deploy();
    const replacement = await ethers.deployContract("TestRandomnessSource");
    const stranger = await ethers.deployContract("TestRandomnessSource");
    const start = BigInt(await time.latest());
    const end = start + 80n;
    await manager.createCampaign(start, end, lock, 1, 1);
    await manager.connect(alice).enter(1);
    await manager.connect(bob).enter(1);
    await time.setNextBlockTimestamp(end);
    await manager.close(1);
    expect(await manager.requestSource(1)).to.equal(await random.getAddress());

    await manager.setRandomnessSource(await replacement.getAddress());
    await expect(replacement.fulfillTo(await manager.getAddress(), 1, 7)).to.be.revertedWithCustomError(
      manager,
      "InvalidRandomnessSource"
    );
    await expect(stranger.fulfillTo(await manager.getAddress(), 1, 9)).to.be.revertedWithCustomError(
      manager,
      "InvalidRandomnessSource"
    );

    await random.fulfill(1, 1);
    expect((await manager.campaigns(1)).status).to.equal(2n);
    await expect(manager.connect(alice).withdraw(1)).to.be.revertedWithCustomError(manager, "NotWithdrawable");
    await manager.collectTickets(1, owner.address);
    expect(await manager.totalLocked(1)).to.equal(0n);
  });

  it("returns locked ECO after cancellation", async function () {
    const { token, manager, alice, lock } = await deploy();
    const start = BigInt(await time.latest());
    await manager.createCampaign(start, start + 500n, lock, 2, 1);
    await manager.connect(alice).enter(1);
    await manager.cancel(1);
    await manager.connect(alice).withdraw(1);
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("10"));
  });
});
