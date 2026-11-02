const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EcoStaking", function () {
  async function deploy() {
    const [deployer, alice] = await ethers.getSigners();
    const token = await ethers.deployContract("EcoToken", [ethers.parseEther("1000")]);
    const staking = await ethers.deployContract("EcoStaking", [await token.getAddress()]);
    await staking.waitForDeployment();
    return { token, staking, deployer, alice };
  }

  it("locks ECO and returns it without paying yield", async function () {
    const { token, staking, deployer, alice } = await deploy();
    const amount = ethers.parseEther("100");
    await token.approve(await staking.getAddress(), amount);

    await expect(staking.stake(amount)).to.emit(staking, "Staked").withArgs(deployer.address, amount);
    expect(await staking.staked(deployer.address)).to.equal(amount);
    expect(await token.balanceOf(deployer.address)).to.equal(ethers.parseEther("900"));
    expect(await staking.totalStaked()).to.equal(amount);

    await expect(staking.unstake(amount + 1n)).to.be.revertedWithCustomError(staking, "InsufficientStake");
    await expect(staking.unstake(ethers.parseEther("40")))
      .to.emit(staking, "Unstaked")
      .withArgs(deployer.address, ethers.parseEther("40"));
    expect(await staking.staked(deployer.address)).to.equal(ethers.parseEther("60"));
    expect(await token.balanceOf(alice.address)).to.equal(0n);
  });

  it("can pause new stakes while unstake still works", async function () {
    const { token, staking, deployer } = await deploy();
    const amount = ethers.parseEther("10");
    await token.approve(await staking.getAddress(), amount);
    await staking.stake(amount);
    await staking.pauseStake();
    await expect(staking.stake(1n)).to.be.revertedWithCustomError(staking, "StakingPaused");
    await staking.unstake(amount);
    expect(await staking.staked(deployer.address)).to.equal(0n);
  });

  it("recovers only tokens that were not recorded as stake", async function () {
    const { token, staking, deployer, alice } = await deploy();
    const locked = ethers.parseEther("20");
    await token.approve(await staking.getAddress(), locked);
    await staking.stake(locked);
    await token.transfer(await staking.getAddress(), ethers.parseEther("5"));

    await expect(staking.recoverExcess(ethers.ZeroAddress)).to.be.revertedWithCustomError(staking, "ZeroAddress");
    await staking.recoverExcess(alice.address);
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("5"));
    expect(await staking.staked(deployer.address)).to.equal(locked);
    await staking.unstake(locked);
    expect(await token.balanceOf(deployer.address)).to.equal(ethers.parseEther("995"));
  });

  it("rejects an empty stake", async function () {
    const { staking } = await deploy();
    await expect(staking.stake(0)).to.be.revertedWithCustomError(staking, "ZeroAmount");
    await expect(staking.unstake(0)).to.be.revertedWithCustomError(staking, "ZeroAmount");
  });
});
