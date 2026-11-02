const { ethers, network } = require("hardhat");

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId === 1n) {
    throw new Error("Refusing to configure Ethereum mainnet.");
  }
  const tokenAddress = process.env.TOKEN_ADDRESS;
  const attester = process.env.ATTESTER_ADDRESS;
  if (!tokenAddress || !attester) {
    throw new Error("Set TOKEN_ADDRESS and ATTESTER_ADDRESS. Do not put a private key in this script.");
  }
  const token = await ethers.getContractAt("EcoToken", tokenAddress);
  const tx = await token.grantAttester(attester);
  await tx.wait();
  console.log("Granted attester", attester, "on", network.name, "tx", tx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
