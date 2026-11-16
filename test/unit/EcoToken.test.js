const { expect } = require("chai");
const { ethers } = require("hardhat");
const { signMint, submissionId, recordHash } = require("../helpers/sign");

const INITIAL = ethers.parseEther("900000");
const MAX_SUPPLY = ethers.parseEther("1000000");

describe("EcoToken", function () {
  async function deploy(initialSupply = INITIAL) {
    const [deployer, alice, bob] = await ethers.getSigners();
    const token = await ethers.deployContract("EcoToken", [initialSupply, deployer.address]);
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

  it("mints the signed reward and the coins can be transferred", async function () {
    const { token, deployer, alice, bob } = await deploy(0n);
    const reward = ethers.parseEther("5");
    const id = submissionId("submission-7");
    const signed = await signMint(deployer, token, alice.address, id, reward, 1n);

    await expect(
      token.mintWithAttestation(alice.address, id, reward, 1n, signed.deadline, signed.recordHash, signed.signature)
    )
      .to.emit(token, "Minted")
      .withArgs(id, alice.address, reward, signed.recordHash, deployer.address);

    expect(await token.balanceOf(alice.address)).to.equal(reward);
    expect(await token.totalSupply()).to.equal(reward);
    expect(await token.recordHashes(id)).to.equal(signed.recordHash);
    expect(await token.name()).to.equal("Green Eco Token");

    await token.connect(alice).transfer(bob.address, ethers.parseEther("2"));
    expect(await token.balanceOf(bob.address)).to.equal(ethers.parseEther("2"));
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("3"));
  });

  it("accepts a permit approval", async function () {
    const { token, deployer, alice } = await deploy();
    const value = ethers.parseEther("4");
    const nonce = await token.nonces(deployer.address);
    const block = await ethers.provider.getBlock("latest");
    const permitDeadline = BigInt(block.timestamp) + 3600n;
    const network = await ethers.provider.getNetwork();
    const signature = await deployer.signTypedData(
      { name: "Green Eco Token", version: "1", chainId: network.chainId, verifyingContract: await token.getAddress() },
      {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { owner: deployer.address, spender: alice.address, value, nonce, deadline: permitDeadline }
    );
    const split = ethers.Signature.from(signature);
    await token.permit(deployer.address, alice.address, value, permitDeadline, split.v, split.r, split.s);
    expect(await token.allowance(deployer.address, alice.address)).to.equal(value);
  });

  it("moves administration only when the new owner accepts", async function () {
    const { token, deployer, alice, bob } = await deploy(0n);
    await token.grantAttester(bob.address);
    await token.transferOwnership(alice.address);
    await expect(token.connect(alice).grantAttester(alice.address)).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    expect(await token.owner()).to.equal(deployer.address);
    expect(await token.isAttester(deployer.address)).to.equal(true);

    await token.connect(alice).acceptOwnership();
    expect(await token.owner()).to.equal(alice.address);
    expect(await token.isAttester(deployer.address)).to.equal(false);
    expect(await token.isAttester(alice.address)).to.equal(false);
    expect(await token.isAttester(bob.address)).to.equal(true);

    const stale = await signMint(deployer, token, alice.address, submissionId("stale"), ethers.parseEther("1"), 1n);
    await expect(
      token.mintWithAttestation(
        alice.address,
        stale.submissionId,
        ethers.parseEther("1"),
        1n,
        stale.deadline,
        stale.recordHash,
        stale.signature
      )
    )
      .to.be.revertedWithCustomError(token, "InvalidAttester")
      .withArgs(deployer.address);

    const kept = await signMint(bob, token, alice.address, submissionId("dedicated-attester"), ethers.parseEther("1"), 4n);
    await token.mintWithAttestation(
      alice.address,
      kept.submissionId,
      ethers.parseEther("1"),
      4n,
      kept.deadline,
      kept.recordHash,
      kept.signature
    );
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("1"));
  });

  it("lets the owner revoke a dedicated attester", async function () {
    const { token, deployer, alice, bob } = await deploy(0n);
    await token.grantAttester(bob.address);
    await token.revokeAttester(bob.address);
    const revoked = await signMint(bob, token, alice.address, submissionId("revoked"), ethers.parseEther("1"), 2n);
    await expect(
      token.mintWithAttestation(
        alice.address,
        revoked.submissionId,
        ethers.parseEther("1"),
        2n,
        revoked.deadline,
        revoked.recordHash,
        revoked.signature
      )
    )
      .to.be.revertedWithCustomError(token, "InvalidAttester")
      .withArgs(bob.address);
    expect(await token.isAttester(deployer.address)).to.equal(true);
  });

  it("does not treat the owner as an attester unless that address is configured", async function () {
    const [owner, attester, recipient] = await ethers.getSigners();
    const token = await ethers.deployContract("EcoToken", [0, attester.address]);
    expect(await token.owner()).to.equal(owner.address);
    expect(await token.isAttester(owner.address)).to.equal(false);
    expect(await token.isAttester(attester.address)).to.equal(true);

    const unsignedOwner = await signMint(owner, token, recipient.address, submissionId("owner-cannot-mint"), ethers.parseEther("1"), 1n);
    await expect(
      token.mintWithAttestation(
        recipient.address,
        unsignedOwner.submissionId,
        ethers.parseEther("1"),
        1n,
        unsignedOwner.deadline,
        unsignedOwner.recordHash,
        unsignedOwner.signature
      )
    ).to.be.revertedWithCustomError(token, "InvalidAttester");

    const signed = await signMint(attester, token, recipient.address, submissionId("configured-attester"), ethers.parseEther("1"), 1n);
    await token.mintWithAttestation(
      recipient.address,
      signed.submissionId,
      ethers.parseEther("1"),
      1n,
      signed.deadline,
      signed.recordHash,
      signed.signature
    );
    expect(await token.balanceOf(recipient.address)).to.equal(ethers.parseEther("1"));
  });

  it("pauses new mints without blocking a transfer", async function () {
    const { token, deployer, alice } = await deploy();
    await token.pauseMinting();
    const signed = await signMint(deployer, token, alice.address, submissionId("paused"), ethers.parseEther("1"), 1n);
    await expect(
      token.mintWithAttestation(
        alice.address,
        signed.submissionId,
        ethers.parseEther("1"),
        1n,
        signed.deadline,
        signed.recordHash,
        signed.signature
      )
    ).to.be.revertedWithCustomError(token, "MintingPaused");

    await token.transfer(alice.address, ethers.parseEther("1"));
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("1"));
    expect(token.interface.getFunction("pause")).to.equal(null);
  });

  it("rejects a direct transfer into the token and a full-cap starting supply", async function () {
    const { token } = await deploy();
    await expect(token.transfer(await token.getAddress(), 1n)).to.be.revertedWithCustomError(token, "DirectTransferToContract");
    const factory = await ethers.getContractFactory("EcoToken");
    const [deployer] = await ethers.getSigners();
    await expect(factory.deploy(MAX_SUPPLY, deployer.address)).to.be.revertedWithCustomError(factory, "MaxSupplyExceeded");
  });

  it("does not contain a gram conversion", async function () {
    const fs = require("fs");
    const source = fs.readFileSync("contracts/core/EcoToken.sol", "utf8");
    expect(source.toLowerCase()).to.not.include("gram");
  });
});
