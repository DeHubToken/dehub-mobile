import { ethers } from 'ethers';
import { getMintFee } from './nft.service';

/** Refresh routing without changing the amount the creator already accepted. */
export async function currentMintFeeRecipient(chainId: number): Promise<string> {
  const latest = await getMintFee(chainId);
  if (!latest?.chargeable || latest.chainId !== chainId || !latest.recipient ||
    !ethers.utils.isAddress(latest.recipient) || latest.recipient.toLowerCase() === ethers.constants.AddressZero) {
    throw new Error('Unable to verify the mint fee destination. Please try again.');
  }
  return latest.recipient;
}
