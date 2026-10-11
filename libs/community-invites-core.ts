export type InviteOutcome = 'sent' | 'skipped' | 'review' | 'failed';
export interface InviteBatchIO {
  prepare(address: string): Promise<(() => Promise<void>) | null>;
  claim(address: string): Promise<'claimed' | 'sent' | 'pending'>;
  confirm(address: string): Promise<void>;
  shouldContinue(): boolean;
}
export function allowsFreeCommunityInvite(status: { disables?: string[]; perMessageFee?: number | string } | null) {
  if (!status) return false;
  const fee = Number(status.perMessageFee ?? 0);
  return Number.isFinite(fee) && fee === 0 && !status.disables?.some(value => ['ALL','NEW_DM'].includes(value.toUpperCase()));
}
/** One acknowledgement at a time. An uncertain send is retained for chat review. */
export async function sendCommunityInviteBatch(addresses: string[], io: InviteBatchIO) {
  const recipients = [...new Set(addresses.map(value => value.toLowerCase()))];
  if (recipients.length > 50) throw new Error('Too many recipients');
  const results: Record<string, InviteOutcome> = {};
  for (const address of recipients) {
    if (!io.shouldContinue()) break;
    if (!/^0x[0-9a-f]{40}$/.test(address)) { results[address] = 'skipped'; continue; }
    let claimed = false;
    try {
      const send = await io.prepare(address);
      if (!io.shouldContinue()) break;
      if (!send) { results[address] = 'skipped'; continue; }
      const claim = await io.claim(address);
      if (claim !== 'claimed') { results[address] = claim === 'sent' ? 'skipped' : 'review'; continue; }
      claimed = true;
      await send();
      results[address] = 'sent';
      // If acknowledgement storage fails, the pending reservation still prevents a resend.
      await io.confirm(address).catch(() => {});
    } catch {
      results[address] = claimed ? 'review' : 'failed';
    }
  }
  return results;
}
