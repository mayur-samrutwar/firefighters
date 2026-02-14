require("dotenv").config({ path: ".env.local" });
require("@nomicfoundation/hardhat-toolbox");

const {
  MONAD_TESTNET_RPC_URL,
  MONAD_TESTNET_PRIVATE_KEY,
  ETHERSCAN_API_KEY,
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
      metadata: {
        bytecodeHash: "ipfs", // required for Sourcify (MonadVision)
      },
    },
  },
  networks: {
    hardhat: {},
    monadTestnet: {
      url: MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz",
      accounts: MONAD_TESTNET_PRIVATE_KEY ? [MONAD_TESTNET_PRIVATE_KEY] : [],
      chainId: 10143,
    },
  },
  etherscan: {
    apiKey: {
      monadTestnet: ETHERSCAN_API_KEY || "dummy",
    },
    customChains: [
      {
        network: "monadTestnet",
        chainId: 10143,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=10143",
          browserURL: "https://testnet.monadscan.com",
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify-api-monad.blockvision.org",
  },
};

module.exports = config;


