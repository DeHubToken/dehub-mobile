export interface LayerSubmission { id: string; phase: 'prepared' | 'paying' | 'paid' | 'submitted'; txHash?: string; sourceDigest?: string }
export interface LayerSubmissionStorage { read(): Promise<LayerSubmission | null>; write(value: LayerSubmission): Promise<void> }
const admissions = new Set<string>();
export async function withLayerAdmission<T>(key: string, action: () => Promise<T>): Promise<T> {
  if (admissions.has(key)) throw new Error('This image already has a payment in progress');
  admissions.add(key);
  try { return await action(); } finally { admissions.delete(key); }
}
/** The wallet boundary is ambiguous after interruption: only a persisted receipt permits submission. */
export async function resumeLayerSubmission(storage: LayerSubmissionStorage, actions: {
  uuid(): string; sourceDigest?: string; current(): boolean; beforePay?(): Promise<void>; pay(): Promise<string>; submit(id: string, txHash: string, sourceDigest?: string): Promise<void>;
}) {
  let saved = await storage.read();
  if (!saved) { saved = { id: actions.uuid(), phase: 'prepared', sourceDigest: actions.sourceDigest }; await storage.write(saved); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.id) || !['prepared','paying','paid','submitted'].includes(saved.phase) ||
    (saved.txHash !== undefined && saved.txHash !== 'credits' && !/^0x[a-f0-9]{64}$/i.test(saved.txHash)) || (['paid','submitted'].includes(saved.phase) && !saved.txHash) || (saved.sourceDigest !== undefined && !/^[a-f0-9]{64}$/.test(saved.sourceDigest))) throw new Error('Saved layer payment needs recovery');
  if (saved.sourceDigest !== actions.sourceDigest) throw new Error('Review the saved source before continuing this payment');
  if (!actions.current()) throw new Error('The selected account or image changed');
  if (saved.phase === 'paying') throw new Error('Payment confirmation was interrupted. Collect the saved job before paying again.');
  if (!saved.txHash) {
    saved = { ...saved, phase: 'paying' }; await storage.write(saved);
    try {
      await actions.beforePay?.();
      if (!actions.current()) { await storage.write({ ...saved, phase:'prepared' }); return; }
    } catch (error) { await storage.write({ ...saved, phase:'prepared' }); throw error; }
    const txHash = await actions.pay();
    saved = { ...saved, phase: 'paid', txHash }; await storage.write(saved);
  }
  if (!actions.current()) return;
  await actions.submit(saved.id, saved.txHash!, saved.sourceDigest);
  await storage.write({ ...saved, phase: 'submitted' });
}
