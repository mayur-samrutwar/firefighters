import { ethers } from "ethers";

/** ABI for game operator and admin: closeHour, burn, read lastBucket; withdraw for yearly rewards */
export const GAME_TREASURY_OPERATOR_ABI = [
  "function closeHour() external",
  "function burnLastHourRewardsOnCollapse() external",
  "function lastBucket() view returns (uint256)",
  "function lastBucketSettled() view returns (bool)",
  "function treasuryAccumulated() view returns (uint256)",
  "function withdrawTreasury(address payable to, uint256 amount) external",
] as const;

export function getTreasuryOperator(
  rpcUrl: string,
  treasuryAddress: string,
  privateKey: string
): { contract: ethers.Contract; signer: ethers.Wallet } {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(
    treasuryAddress,
    GAME_TREASURY_OPERATOR_ABI,
    signer
  );
  return { contract, signer };
}

export async function closeHourAndBurnOnCollapse(
  rpcUrl: string,
  treasuryAddress: string,
  privateKey: string
): Promise<{ lastBucketWei: bigint }> {
  const { contract } = getTreasuryOperator(rpcUrl, treasuryAddress, privateKey);
  const txClose = await contract.closeHour();
  await txClose.wait();
  const lastBucketWei = (await contract.lastBucket()) as bigint;
  const txBurn = await contract.burnLastHourRewardsOnCollapse();
  await txBurn.wait();
  return { lastBucketWei };
}
