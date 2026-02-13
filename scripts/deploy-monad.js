// Deploy GameTreasury (native MON) to Monad testnet.
//
// Usage:
//   MONAD_TESTNET_PRIVATE_KEY=... MONAD_TESTNET_RPC_URL=... \\
//   npx hardhat run scripts/deploy-monad.js --network monadTestnet

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with:", deployer.address);
  console.log("Network:", hre.network.name);

  const GameTreasury = await hre.ethers.getContractFactory("GameTreasury");
  const treasury = await GameTreasury.deploy(
    deployer.address, // admin
    deployer.address  // gameOperator (backend signer)
  );
  await treasury.waitForDeployment();

  console.log("GameTreasury deployed to:", treasury.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

