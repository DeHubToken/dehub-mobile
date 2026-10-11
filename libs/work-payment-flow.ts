export type WorkPaymentIntent = {
  id: string; submission_id: string; job_id: string; payer_address: string; worker_address: string;
  currency: 'DHB' | 'USDC'; amount: number | string; chain_id: number; state: string; tx_hash: string | null; created: boolean;
};
type ReceiptProof = { payload: string; signature: string } | null;

// Only wrap preparation that cannot submit a transaction. Send failures may
// already have reached the chain and must retain their reservation.
export async function prepareWorkPayment<T>(prepare: () => Promise<T>): Promise<T> {
  try { return await prepare(); }
  catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    throw Object.assign(new Error(message || 'Could not prepare the bounty payment'), { code: 'WORK_NOT_SENT', cause: error });
  }
}

export type WorkPaymentDependencies = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  send: (intent: WorkPaymentIntent) => Promise<{ hash: string; wait?: (confirmations: number) => Promise<unknown> }>;
  receipt: (intent: WorkPaymentIntent, hash: string) => Promise<ReceiptProof>;
  storage: { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void>; remove: (key: string) => Promise<void> };
};

function rejectedBeforeBroadcast(error: unknown) {
  const e = error as { code?: unknown; message?: string };
  return e?.code === 4001 || e?.code === 'ACTION_REJECTED' || e?.code === 'WORK_NOT_SENT'
    || /user (rejected|denied)|wallet is locked|not enough (DHB|USDC)|INSUFFICIENT_GAS_FUNDS/i.test(e?.message || '');
}

export async function runWorkPayment(submissionId: string, chain: number, deps: WorkPaymentDependencies, recoveryHash?: string) {
  const intent = await deps.rpc('work_claim_payment', { p_submission: submissionId, p_chain: chain }) as WorkPaymentIntent;
  const key = `work-payment:${intent.id}`;
  // Another device may have completed this intent before the UI refreshed.
  if (intent.state === 'confirmed') {
    try { await deps.storage.remove(key); } catch { /* server confirmation is authoritative */ }
    return 'confirmed' as const;
  }
  let hash = intent.tx_hash || recoveryHash;
  if (!hash) {
    try { hash = await deps.storage.get(key) || undefined; } catch { /* the server reservation still prevents another transfer */ }
  }
  if (!hash && !intent.created) {
    throw new Error('This payment is reserved. Enter its transaction hash to reconcile it. If wallet signing was rejected, release the reservation before retrying.');
  }
  if (!hash) {
    let sent: Awaited<ReturnType<WorkPaymentDependencies['send']>>;
    try { sent = await deps.send(intent); }
    catch (error) {
      if (rejectedBeforeBroadcast(error)) {
        try { await deps.rpc('work_cancel_signature', { p_intent: intent.id }); }
        catch { /* retain the reservation and the original preparation/signing error */ }
      }
      throw error;
    }
    hash = sent.hash;
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash || '')) throw new Error('Payment signing returned no transaction hash. Reconcile the reservation before retrying.');
    try { await deps.storage.set(key, hash); } catch { /* still persist the hash on the server */ }
    // Keep the reservation and hash through every timeout. A second attempt only reconciles.
    try { await deps.rpc('work_record_broadcast', { p_intent: intent.id, p_hash: hash }); }
    catch {
      throw new Error(`Transaction ${hash} was submitted but could not be recorded. Keep this hash and use Check payment; do not send it again.`);
    }
    try { await sent.wait?.(2); } catch { /* only a verified chain receipt determines the outcome */ }
  } else {
    await deps.rpc('work_record_broadcast', { p_intent: intent.id, p_hash: hash });
  }
  const proof = await deps.receipt(intent, hash);
  if (!proof) return 'pending' as const;
  const state = await deps.rpc('work_finalize_payment', { p_intent: intent.id, p_payload: proof.payload, p_signature: proof.signature });
  if (state === 'failed') {
    try { await deps.storage.remove(key); } catch { /* the verified failure remains authoritative */ }
    throw new Error('The transfer reverted. No payout was recorded; you can retry payment.');
  }
  if (state !== 'confirmed') throw new Error('Payment is awaiting verified confirmation');
  try { await deps.storage.remove(key); } catch { /* server confirmation is authoritative */ }
  return 'confirmed' as const;
}
