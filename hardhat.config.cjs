require("dotenv").config({ path: ".env.local" });
require("@nomicfoundation/hardhat-toolbox");

const {
  MONAD_TESTNET_RPC_URL,
  MONAD_TESTNET_PRIVATE_KEY,
} = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    monadTestnet: {
      url: MONAD_TESTNET_RPC_URL || "",
      accounts: MONAD_TESTNET_PRIVATE_KEY ? [MONAD_TESTNET_PRIVATE_KEY] : [],
    },
  },
};

module.exports = config;


