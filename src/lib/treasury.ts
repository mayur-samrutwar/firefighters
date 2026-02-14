import { ethers } from "ethers";

const TREASURY_ABI = [
  "function agents(bytes32) view returns (address owner, uint96 totalPaid, bool active)",
];

export const REGISTRATION_FEE_WEI = ethers.parseEther("0.1");

/**
 * Flow: (1) POST /register → get agentId + secret.
 *       (2) Pay 0.1 MON on-chain: registerAgent(keccak256(agentId)) from same wallet.
 *       (3) Then /perception and /act work. If agent dies (battery 0), they must pay
 *           another 0.1 MON to re-enter; we require totalPaid > paid_for_life_wei then revive.
 */
export async function getAgentPayment(
  agentId: string,
  expectedOwnerAddress: string,
  rpcUrl: string,
  treasuryAddress: string
): Promise<{ ok: boolean; totalPaidWei: bigint }> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const treasury = new ethers.Contract(treasuryAddress, TREASURY_ABI, provider);
  const bytes32Id = ethers.id(agentId);
  const [owner, totalPaid] = await treasury.agents(bytes32Id);
  if (!owner || owner === ethers.ZeroAddress)
    return { ok: false, totalPaidWei: 0n };
  const ownerLower = (owner as string).toLowerCase();
  const expectedLower = expectedOwnerAddress.toLowerCase();
  if (ownerLower !== expectedLower)
    return { ok: false, totalPaidWei: totalPaid as bigint };
  return {
    ok: (totalPaid as bigint) >= REGISTRATION_FEE_WEI,
    totalPaidWei: totalPaid as bigint,
  };
}
