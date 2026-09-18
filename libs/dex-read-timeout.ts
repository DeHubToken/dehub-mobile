/** Use only for reads/preparation. Never race a submitted transaction against a retry timer. */
export async function readWithTimeout<T>(read: Promise<T>, label: string, milliseconds = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), milliseconds);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
export type OrderStage = 'quote' | 'wallet' | 'balance' | 'tokenApproval' | 'permitApproval' | 'submit' | 'confirm';
