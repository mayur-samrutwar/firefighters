require("dotenv").config({ path: ".env.local" });
require("@nomicfoundation/hardhat-toolbox");

const {
  MONAD_MAINNET_RPC_URL,
  MONAD_MAINNET_PRIVATE_KEY,
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
    monadMainnet: {
      url: MONAD_MAINNET_RPC_URL || "https://rpc.monad.xyz",
      accounts: MONAD_MAINNET_PRIVATE_KEY ? [MONAD_MAINNET_PRIVATE_KEY] : [],
      chainId: 143,
    },
  },
  etherscan: {
    apiKey: {
      monadMainnet: ETHERSCAN_API_KEY || "dummy",
    },
    customChains: [
      {
        network: "monadMainnet",
        chainId: 143,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=143",
          browserURL: "https://monadscan.com",
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


