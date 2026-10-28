import { Platform } from 'react-native';
import type { AvatarQuote, AvatarSubmission } from './creatorAvatar';
import { matchingAvatarQuote } from './creatorAvatar';

export interface AvatarPaymentAdapter {
  input: AvatarSubmission;
  reviewed: AvatarQuote;
  newId: () => string;
  current: () => boolean;
  load: () => Promise<AvatarSubmission | null>;
  save: (value: AvatarSubmission) => Promise<void>;
  quote: () => Promise<AvatarQuote>;
  pay: (amount: number) => Promise<string>;
  receipt: (id: string) => Promise<string | undefined>;
  submit: (value: AvatarSubmission, receipt: string) => void;
}

export async function resumeAvatarPayment(a: Pick<AvatarPaymentAdapter, 'load' | 'current' | 'save' | 'receipt' | 'submit'>) {
  const previous = await a.load();
  if (!a.current()) throw new Error('creator.priceRetry');
  if (!previous?.clientJobId || previous.phase === 'prepared') throw new Error('creatorFlow.recoveryPending');
  const receipt = previous.txHash ?? await a.receipt(previous.clientJobId);
  if (!receipt) throw new Error('creatorFlow.recoveryPending');
  const resumed = { ...previous, txHash: receipt, phase: 'signed' as const };
  await a.save(resumed);
  if (!a.current()) throw new Error('creator.priceRetry');
  a.submit(resumed, receipt);
}

/** The caller holds an exclusive owner admission lock for this entire operation. */
export async function admitAvatarPayment(a: AvatarPaymentAdapter) {
  const previous = await a.load();
  if (!a.current()) throw new Error('creator.priceRetry');
  if (previous?.clientJobId && previous.phase !== 'prepared') {
    if (previous.inputDigest !== a.reviewed.inputDigest) throw new Error('creatorFlow.recoveryPending');
    await resumeAvatarPayment(a);
    return;
  }
  const prepared: AvatarSubmission = { ...a.input, clientJobId: previous?.inputDigest === a.reviewed.inputDigest ? previous.clientJobId : a.newId(),
    inputDigest: a.reviewed.inputDigest, acceptedPriceDhb: a.reviewed.priceDhb, phase: 'prepared', txHash: undefined };
  await a.save(prepared);
  if (!a.current()) throw new Error('creator.priceRetry');
  // Persist intent before opening a wallet. An interruption cannot become another payment.
  await a.save({ ...prepared, phase: 'paying' });
  let paymentStarted = false;
  try {
    const fresh = await a.quote();
    if (!a.current() || !matchingAvatarQuote(a.reviewed, fresh)) throw new Error('creator.priceRetry');
    paymentStarted = true;
    const txHash = await a.pay(fresh.priceDhb);
    const signed: AvatarSubmission = { ...prepared, txHash, phase: 'signed' };
    await a.save(signed);
    if (!a.current()) throw new Error('creator.priceRetry');
    a.submit(signed, txHash);
  } catch (error) {
    // Before pay() was entered there cannot have been a wallet transfer.
    if (!paymentStarted) await a.save(prepared);
    throw error;
  }
}

const activeOwners = new Set<string>();
export async function withAvatarAdmission<T>(owner: string, operation: () => Promise<T>): Promise<T> {
  const key = owner.toLowerCase();
  if (Platform.OS === 'web') {
    if (!navigator.locks) throw new Error('creatorFlow.recoveryPending');
    return navigator.locks.request(`creator-avatar:${key}`, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('creatorFlow.recoveryPending');
      return operation();
    });
  }
  if (activeOwners.has(key)) throw new Error('creatorFlow.recoveryPending');
  activeOwners.add(key);
  try { return await operation(); } finally { activeOwners.delete(key); }
}