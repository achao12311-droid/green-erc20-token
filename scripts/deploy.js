const { ethers } = require("hardhat");

async function main() {
  const wholeTokens = (process.env.INITIAL_SUPPLY || "0").replaceAll("_", "").trim();
  const initialSupply = ethers.parseEther(wholeTokens);
  const token = await ethers.deployContract("EcoToken", [initialSupply]);
  await token.waitForDeployment();
  console.log("EcoToken deployed to:", await token.getAddress());
  console.log("Initial supply (wei):", initialSupply.toString());
  console.log("Max supply (wei):", (await token.MAX_SUPPLY()).toString());
  console.log("Grams per ECO:", (await token.GRAMS_PER_ECO()).toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
