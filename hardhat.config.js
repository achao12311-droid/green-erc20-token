require("@nomicfoundation/hardhat-toolbox");

// A missing .env file is not an error. Local compile and test use the in-process
// hardhat network and do not read SEPOLIA_RPC_URL or PRIVATE_KEY.
require("dotenv").config();

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // OpenZeppelin 5.7 uses the Cancun MCOPY opcode.
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts,
    },
    // Generic proof-of-stake L2 (Polygon, Arbitrum, or similar).
    // Used only when someone passes --network l2 and sets L2_RPC_URL.
    l2: {
      url: process.env.L2_RPC_URL || "",
      accounts,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};
