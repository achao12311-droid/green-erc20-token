const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const INITIAL = ethers.parseEther("1000000");
const MAX_SUPPLY = ethers.parseEther("1000000");

async function signMint(signer, token, to, actionId, grams, nonce, deadline) {
  if (deadline === undefined) {
    deadline = BigInt(await time.latest()) + 3600n;
  }
  const network = await ethers.provider.getNetwork();
  const signature = await signer.signTypedData(
    {
      name: "EcoToken",
      version: "1",
      chainId: network.chainId,
      verifyingContract: await token.getAddress(),
    },
    {
      Mint: [
        { name: "to", type: "address" },
        { name: "actionId", type: "uint256" },
        { name: "grams", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    { to, actionId, grams, nonce, deadline }
  );
  return { signature, deadline };
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

  it("mints the published gram record", async function () {
    const csv = fs.readFileSync(path.join(__dirname, "../records/action-1.csv"), "utf8").trim().split(/\r?\n/);
    const [actionId, grams, nonce] = csv[1].split(",").map((value) => BigInt(value.trim()));
    const { token, deployer, alice } = await deploy(0n);
    const { signature, deadline } = await signMint(deployer, token, alice.address, actionId, grams, nonce);
    const amount = (grams * 10n ** 18n) / 1000n;

    await expect(token.mintWithAttestation(alice.address, actionId, grams, nonce, deadline, signature))
      .to.emit(token, "Minted")
      .withArgs(actionId, alice.address, grams, amount);

    expect(amount).to.equal(ethers.parseEther("0.005"));
    expect(await token.balanceOf(alice.address)).to.equal(amount);
  });

  it("mints from a signed record and the coins can be transferred", async function () {
    const { token, deployer, alice, bob } = await deploy(0n);
    const actionId = 7n;
    const grams = 5000n;
    const nonce = 1n;
    const amount = ethers.parseEther("5");
    const { signature, deadline } = await signMint(deployer, token, alice.address, actionId, grams, nonce);

    expect(token.interface.getFunction("pause")).to.equal(null);

    await expect(token.mintWithAttestation(alice.address, actionId, grams, nonce, deadline, signature))
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
    const firstMint = await signMint(deployer, token, alice.address, 1n, grams, nonce);

    await token.mintWithAttestation(alice.address, 1n, grams, nonce, firstMint.deadline, firstMint.signature);
    await expect(token.mintWithAttestation(alice.address, 1n, grams, nonce, firstMint.deadline, firstMint.signature))
      .to.be.revertedWithCustomError(token, "ActionAlreadyUsed")
      .withArgs(1n);

    const other = await signMint(alice, token, alice.address, 2n, grams, nonce);
    await expect(token.mintWithAttestation(alice.address, 2n, grams, nonce, other.deadline, other.signature))
      .to.be.revertedWithCustomError(token, "InvalidAttester")
      .withArgs(alice.address);
  });

  it("stops minting at the supply cap", async function () {
    const { token, deployer, alice } = await deploy(MAX_SUPPLY - ethers.parseEther("1"));
    const grams = 1000n;
    const first = await signMint(deployer, token, alice.address, 1n, grams, 1n);

    await token.mintWithAttestation(alice.address, 1n, grams, 1n, first.deadline, first.signature);
    expect(await token.totalSupply()).to.equal(MAX_SUPPLY);

    const second = await signMint(deployer, token, alice.address, 2n, grams, 2n);
    await expect(token.mintWithAttestation(alice.address, 2n, grams, 2n, second.deadline, second.signature))
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
    await expect(token.mintWithAttestation(alice.address, 1n, 1000n, 1n, stale.deadline, stale.signature))
      .to.be.revertedWithCustomError(token, "InvalidAttester")
      .withArgs(deployer.address);

    const current = await signMint(alice, token, alice.address, 1n, 1000n, 1n);
    await token.mintWithAttestation(alice.address, 1n, 1000n, 1n, current.deadline, current.signature);
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("1"));
  });

  it("rejects an expired signature, a signature for another chain, and a mint to the contract", async function () {
    const { token, deployer, alice } = await deploy(0n);
    const now = BigInt(await time.latest());
    const expired = await signMint(deployer, token, alice.address, 1n, 1000n, 1n, now);
    await time.setNextBlockTimestamp(now + 1n);
    await expect(token.mintWithAttestation(alice.address, 1n, 1000n, 1n, expired.deadline, expired.signature))
      .to.be.revertedWithCustomError(token, "SignatureExpired")
      .withArgs(expired.deadline);

    const wrongChain = await deployer.signTypedData(
      {
        name: "EcoToken",
        version: "1",
        chainId: 1n,
        verifyingContract: await token.getAddress(),
      },
      {
        Mint: [
          { name: "to", type: "address" },
          { name: "actionId", type: "uint256" },
          { name: "grams", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { to: alice.address, actionId: 2n, grams: 1000n, nonce: 1n, deadline: now + 3600n }
    );
    await expect(token.mintWithAttestation(alice.address, 2n, 1000n, 1n, now + 3600n, wrongChain))
      .to.be.revertedWithCustomError(token, "InvalidAttester");

    const toContract = await signMint(deployer, token, await token.getAddress(), 3n, 1000n, 1n);
    await expect(
      token.mintWithAttestation(await token.getAddress(), 3n, 1000n, 1n, toContract.deadline, toContract.signature)
    ).to.be.revertedWithCustomError(token, "MintToContract");
  });

  it("rejects an empty stake", async function () {
    const { token } = await deploy();
    await expect(token.stake(0)).to.be.revertedWithCustomError(token, "ZeroAmount");
    await expect(token.unstake(0)).to.be.revertedWithCustomError(token, "ZeroAmount");
  });
});
