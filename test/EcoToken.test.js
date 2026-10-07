const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const INITIAL = ethers.parseEther("1000000");
const MAX_SUPPLY = ethers.parseEther("1000000");

async function signMint(signer, token, to, actionId, grams, nonce) {
  const payload = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint256", "uint256", "uint256"],
      [await token.getAddress(), to, actionId, grams, nonce]
    )
  );
  return signer.signMessage(ethers.getBytes(payload));
}

describe("EcoToken", function () {
  async function deploy(initialSupply = INITIAL) {
    const [deployer, alice, bob] = await ethers.getSigners();
    const token = await ethers.deployContract("EcoToken", [initialSupply]);
    await token.waitForDeployment();
    return { token, deployer, alice, bob };
  }

  it("sends with transfer and receives with transferFrom", async function () {
    const { token, deployer, alice, bob } = await deploy();
    const amount = ethers.parseEther("25");

    await token.transfer(alice.address, amount);
    expect(await token.balanceOf(alice.address)).to.equal(amount);
    expect(await token.balanceOf(deployer.address)).to.equal(INITIAL - amount);

    const pulled = ethers.parseEther("7");
    await token.connect(alice).approve(bob.address, pulled);
    await token.connect(bob).transferFrom(alice.address, bob.address, pulled);

    expect(await token.balanceOf(bob.address)).to.equal(pulled);
    expect(await token.balanceOf(alice.address)).to.equal(amount - pulled);
    expect(await token.allowance(alice.address, bob.address)).to.equal(0n);
  });

  it("locks tokens on stake and returns them on unstake", async function () {
    const { token, deployer } = await deploy();
    const amount = ethers.parseEther("100");

    await expect(token.stake(amount)).to.emit(token, "Staked").withArgs(deployer.address, amount);
    expect(await token.staked(deployer.address)).to.equal(amount);
    expect(await token.balanceOf(deployer.address)).to.equal(INITIAL - amount);
    expect(await token.balanceOf(await token.getAddress())).to.equal(amount);

    await expect(token.transfer(ethers.Wallet.createRandom().address, INITIAL - amount + 1n)).to.be.revertedWithCustomError(
      token,
      "ERC20InsufficientBalance"
    );

    const back = ethers.parseEther("40");
    await expect(token.unstake(back)).to.emit(token, "Unstaked").withArgs(deployer.address, back);
    expect(await token.staked(deployer.address)).to.equal(amount - back);
    expect(await token.balanceOf(deployer.address)).to.equal(INITIAL - amount + back);

    await expect(token.unstake(amount)).to.be.revertedWithCustomError(token, "InsufficientStake");
  });

  it("records the producer without minting", async function () {
    const { token, deployer } = await deploy();
    const stake = ethers.parseEther("1");
    await token.stake(stake);

    const supplyBefore = await token.totalSupply();
    const balanceBefore = await token.balanceOf(deployer.address);
    const tx = await token.produceBlock();
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);

    await expect(tx)
      .to.emit(token, "BlockProduced")
      .withArgs(1n, block.timestamp, deployer.address);

    expect(await token.height()).to.equal(1n);
    expect(await token.lastBlockTime()).to.equal(block.timestamp);

    const stored = await token.blocks(1);
    expect(stored.height).to.equal(1n);
    expect(stored.timestamp).to.equal(block.timestamp);
    expect(stored.producer).to.equal(deployer.address);

    expect(await token.balanceOf(deployer.address)).to.equal(balanceBefore);
    expect(await token.totalSupply()).to.equal(supplyBefore);
  });

  it("produces the first block immediately, then only after 60 seconds", async function () {
    const { token, alice } = await deploy();
    await token.transfer(alice.address, ethers.parseEther("5"));
    await token.connect(alice).stake(ethers.parseEther("1"));

    await expect(token.produceBlock()).to.be.revertedWithCustomError(token, "NoStake");

    await token.connect(alice).produceBlock();
    const last = await token.lastBlockTime();

    await expect(token.connect(alice).produceBlock())
      .to.be.revertedWithCustomError(token, "BlockTooEarly")
      .withArgs(last + 60n);

    await time.setNextBlockTimestamp(last + 59n);
    await expect(token.connect(alice).produceBlock())
      .to.be.revertedWithCustomError(token, "BlockTooEarly")
      .withArgs(last + 60n);

    await time.setNextBlockTimestamp(last + 60n);
    await token.connect(alice).produceBlock();

    expect(await token.height()).to.equal(2n);
    expect(await token.lastBlockTime()).to.equal(last + 60n);
    expect((await token.blocks(2)).producer).to.equal(alice.address);
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("4"));
  });

  it("mints the published gram record", async function () {
    const csv = fs.readFileSync(path.join(__dirname, "../records/action-1.csv"), "utf8").trim().split(/\r?\n/);
    const [actionId, grams, nonce] = csv[1].split(",").map((value) => BigInt(value.trim()));
    const { token, deployer, alice } = await deploy(0n);
    const signature = await signMint(deployer, token, alice.address, actionId, grams, nonce);
    const amount = (grams * 10n ** 18n) / 1000n;

    await expect(token.mintWithAttestation(alice.address, actionId, grams, nonce, signature))
      .to.emit(token, "Minted")
      .withArgs(actionId, alice.address, grams, amount);

    expect(amount).to.equal(ethers.parseEther("5"));
    expect(await token.balanceOf(alice.address)).to.equal(amount);
  });

  it("mints from a signed record and the coins can be transferred", async function () {
    const { token, deployer, alice, bob } = await deploy(0n);
    const actionId = 7n;
    const grams = 5000n;
    const nonce = 1n;
    const amount = ethers.parseEther("5");
    const signature = await signMint(deployer, token, alice.address, actionId, grams, nonce);

    expect(token.interface.getFunction("pause")).to.equal(null);

    await expect(token.mintWithAttestation(alice.address, actionId, grams, nonce, signature))
      .to.emit(token, "Minted")
      .withArgs(actionId, alice.address, grams, amount);

    expect(await token.balanceOf(alice.address)).to.equal(amount);
    expect(await token.totalSupply()).to.equal(amount);
    expect(await token.usedActions(actionId)).to.equal(true);

    await token.connect(alice).transfer(bob.address, ethers.parseEther("2"));
    expect(await token.balanceOf(bob.address)).to.equal(ethers.parseEther("2"));
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("3"));
  });

  it("rejects a reused action id and a signature from someone else", async function () {
    const { token, deployer, alice } = await deploy(0n);
    const grams = 1000n;
    const nonce = 1n;
    const signature = await signMint(deployer, token, alice.address, 1n, grams, nonce);

    await token.mintWithAttestation(alice.address, 1n, grams, nonce, signature);
    await expect(token.mintWithAttestation(alice.address, 1n, grams, nonce, signature))
      .to.be.revertedWithCustomError(token, "ActionAlreadyUsed")
      .withArgs(1n);

    const other = await signMint(alice, token, alice.address, 2n, grams, nonce);
    await expect(token.mintWithAttestation(alice.address, 2n, grams, nonce, other))
      .to.be.revertedWithCustomError(token, "InvalidAttester")
      .withArgs(alice.address);
  });

  it("stops minting at the supply cap", async function () {
    const { token, deployer, alice } = await deploy(MAX_SUPPLY - ethers.parseEther("1"));
    const grams = 1000n;
    const first = await signMint(deployer, token, alice.address, 1n, grams, 1n);

    await token.mintWithAttestation(alice.address, 1n, grams, 1n, first);
    expect(await token.totalSupply()).to.equal(MAX_SUPPLY);

    const second = await signMint(deployer, token, alice.address, 2n, grams, 2n);
    await expect(token.mintWithAttestation(alice.address, 2n, grams, 2n, second))
      .to.be.revertedWithCustomError(token, "MaxSupplyExceeded")
      .withArgs(MAX_SUPPLY + ethers.parseEther("1"), MAX_SUPPLY);
  });

  it("moves the attester only when the new owner accepts", async function () {
    const { token, deployer, alice } = await deploy(0n);

    await token.transferOwnership(alice.address);
    expect(await token.attester()).to.equal(deployer.address);

    await token.connect(alice).acceptOwnership();
    expect(await token.attester()).to.equal(alice.address);

    const stale = await signMint(deployer, token, alice.address, 1n, 1000n, 1n);
    await expect(token.mintWithAttestation(alice.address, 1n, 1000n, 1n, stale))
      .to.be.revertedWithCustomError(token, "InvalidAttester")
      .withArgs(deployer.address);

    const current = await signMint(alice, token, alice.address, 1n, 1000n, 1n);
    await token.mintWithAttestation(alice.address, 1n, 1000n, 1n, current);
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("1"));
  });
});
