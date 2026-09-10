import { OPEN_WALLET_METHOD } from "./provider.registry";

/**
 * Open DeHub's built-in wallet before a queued on-chain post starts.
 *
 * The locked-provider shim owns this private RPC method and turns it into the
 * password/biometric sheet. Already-open and external providers may reject the
 * unknown method; their ordinary transaction prompt remains the authority.
 */
export async function prepareWalletForQueuedMint(provider: any): Promise<void> {
  if (typeof provider?.request !== "function") return;

  try {
    await provider.request({ method: OPEN_WALLET_METHOD });
  } catch (error: any) {
    // A refusal from the DeHub unlock sheet must stop the job. Everything else
    // is an unsupported private method on a provider that will prompt normally
    // when the transaction is sent.
    if (error?.name === "WalletLockedError") throw error;
  }
}
