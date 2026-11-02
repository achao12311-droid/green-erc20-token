const { network } = require("hardhat");

const contracts = ["EcoToken", "EcoStaking", "UnconfiguredRandomness", "EcoRewardManager"];

console.log("This script does not deploy and does not send a transaction.");
console.log("Network:", network.name);
console.log("Set TOKEN_ADDRESS, STAKING_ADDRESS, RANDOMNESS_ADDRESS, and REWARD_MANAGER_ADDRESS, then run:");
for (const name of contracts) {
  console.log("npx hardhat verify --network sepolia <address> <constructor args>");
  console.log("contract:", name);
}
console.log("Do not verify or deploy on Ethereum mainnet from this repository's scripts.");
