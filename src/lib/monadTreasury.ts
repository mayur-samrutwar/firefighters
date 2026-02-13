import { ethers } from 'ethers';

const MONAD_RPC_URL = process.env.MONAD_TESTNET_RPC_URL;
const GAME_TREASURY_ADDRESS = process.env.GAME_TREASURY_ADDRESS;

const TREASURY_ABI = [
  'function agents(bytes32) view returns (address owner, uint96 totalPaid, bool active)',
];

const MIN_REGISTRATION_FEE_ETH = process.env.MIN_REGISTRATION_FEE_ETH || '0.1';

export async function hasPaidRegistration(
  agentId: string,
  ownerAddress: string
): Promise<boolean> {
  if (!MONAD_RPC_URL || !GAME_TREASURY_ADDRESS) {
    // In local/dev without chain configured, skip enforcement.
    return true;
  }

  const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
  const contract = new ethers.Contract(
    GAME_TREASURY_ADDRESS,
    TREASURY_ABI,
    provider
  );

  const idBytes = ethers.id(agentId);
  const info = await contract.agents(idBytes);
  const onchainOwner = (info.owner as string) ?? ethers.ZeroAddress;
  const totalPaid = info.totalPaid as bigint;

  if (!onchainOwner || onchainOwner === ethers.ZeroAddress) return false;
  if (onchainOwner.toLowerCase() !== ownerAddress.toLowerCase()) return false;

  const minWei = ethers.parseEther(MIN_REGISTRATION_FEE_ETH);
  return totalPaid >= minWei;
}

