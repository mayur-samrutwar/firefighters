import { ethers } from "ethers";

/** ABI for game operator: closeHour, distribute or burn, read state */
export const GAME_TREASURY_OPERATOR_ABI = [
  "function closeHour() external",
  "function distributeLastHourRewards(bytes32[] calldata winners, uint256[] calldata weights) external",
  "function burnLastHourRewardsOnCollapse() external",
  "function lastBucket() view returns (uint256)",
  "function lastBucketReward() view returns (uint256)",
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

/** Leader entry for hourly reward distribution (agent_id = string id, score = weight). */
export type HourlyLeader = { agent_id: string; score: number };

/**
 * Close the current hour and distribute 90% to the hourly leaderboard by score weight.
 * If there are no leaders or all have score 0, burns the reward share instead (keeps contract settled).
 */
export async function closeHourAndDistribute(
  rpcUrl: string,
  treasuryAddress: string,
  privateKey: string,
  leaders: HourlyLeader[]
): Promise<{ lastBucketWei: bigint; distributed: boolean }> {
  const { contract } = getTreasuryOperator(rpcUrl, treasuryAddress, privateKey);
  const txClose = await contract.closeHour();
  await txClose.wait();
  const lastBucketWei = (await contract.lastBucket()) as bigint;

  const withScore = leaders.filter((l) => (l.score ?? 0) > 0);
  if (withScore.length === 0) {
    const txBurn = await contract.burnLastHourRewardsOnCollapse();
    await txBurn.wait();
    return { lastBucketWei, distributed: false };
  }

  const winners = withScore.map((l) => ethers.id(l.agent_id));
  const weights = withScore.map((l) => BigInt(l.score));
  const txDist = await contract.distributeLastHourRewards(winners, weights);
  await txDist.wait();
  return { lastBucketWei, distributed: true };
}
