const { ethers, network } = require("hardhat");

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId === 1n) {
    throw new Error("Refusing to deploy to Ethereum mainnet.");
  }
  if (network.name === "sepolia" && chainId !== 11155111n) {
    throw new Error("Sepolia network config does not match chain id 11155111.");
  }

  const [deployer] = await ethers.getSigners();
  const wholeTokens = (process.env.INITIAL_SUPPLY || "0").replaceAll("_", "").trim();
  const initialSupply = ethers.parseEther(wholeTokens);
  const attester = (process.env.ATTESTER_ADDRESS || deployer.address).trim();
  if (!ethers.isAddress(attester)) {
    throw new Error("ATTESTER_ADDRESS must be an address. Ownership does not grant minting.");
  }
  const token = await ethers.deployContract("EcoToken", [initialSupply, attester]);
  await token.waitForDeployment();
  const staking = await ethers.deployContract("EcoStaking", [await token.getAddress()]);
  await staking.waitForDeployment();
  const randomness = await ethers.deployContract("UnconfiguredRandomness");
  await randomness.waitForDeployment();
  const rewards = await ethers.deployContract("EcoRewardManager", [
    await token.getAddress(),
    await randomness.getAddress(),
  ]);
  await rewards.waitForDeployment();

  console.log("Network:", network.name, chainId.toString());
  console.log("Owner:", deployer.address);
  console.log("Initial attester:", attester);
  console.log("EcoToken:", await token.getAddress());
  console.log("EcoStaking:", await staking.getAddress());
  console.log("UnconfiguredRandomness:", await randomness.getAddress());
  console.log("EcoRewardManager:", await rewards.getAddress());
  console.log("Initial supply (wei):", initialSupply.toString());
  console.log("Winner drawing is not configured. UnconfiguredRandomness reverts until a VRF source is set.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
