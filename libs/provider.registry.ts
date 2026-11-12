// Simple module-scoped registry for a temporary signing provider
// Used to supply an EIP-1193 compatible provider to auth signature flow

let currentSigningProvider: any | null = null;

export function setSigningProvider(provider: any | null) {
  currentSigningProvider = provider || null;
  externalSigner = false;
}

export function getSigningProvider(): any | null {
  return currentSigningProvider;
}

export function clearSigningProvider() {
  currentSigningProvider = null;
  externalSigner = false;
}

// True while the signing provider above is an external wallet app (Connect
// Wallet / WalletConnect), whose every signature is a prompt in that app.
let externalSigner = false;

export function markExternalSigner(on: boolean) {
  externalSigner = on;
}

export function isExternalSigner(): boolean {
  return externalSigner && !!currentSigningProvider;
}

// The plain EOA signer, kept apart from the override above.
//
// Most accounts sign in as a Safe smart account, so the provider registered
// above is usually the AA one -- correct for transactions, wrong for anything
// whose value has to match what another device produces. A Safe signs a
// message through ERC-1271 (viem signs with account: smartAccount), which is a
// different signature from the owner EOA's EIP-191 one over the same text.
// DM encryption keys are derived from exactly that signature and dehubweb
// derives them from the EOA, so message signing has to reach the EOA here too.
//
// Survives clearSigningProvider(): that runs on every chain switch and
// provider re-init, while this is a property of the wallet, not the session.
// Cleared on sign-out.
let currentEoaSigningProvider: any | null = null;

const eoaListeners = new Set<() => void>();

export function setEoaSigningProvider(provider: any | null) {
  currentEoaSigningProvider = provider || null;
  if (provider) eoaListeners.forEach((cb) => { try { cb(); } catch { /* listener's own problem */ } });
}

/** Called each time the built-in wallet opens (its EOA signer is registered). */
export function onEoaSigningProvider(cb: () => void): () => void {
  eoaListeners.add(cb);
  return () => { eoaListeners.delete(cb); };
}

export function getEoaSigningProvider(): any | null {
  return currentEoaSigningProvider;
}

export function clearEoaSigningProvider() {
  currentEoaSigningProvider = null;
}

/**
 * Not an RPC method: "open the wallet and tell me you did".
 *
 * The locked provider shim treats it as a signing method, so it raises the
 * unlock the same way a real signature would, but it signs nothing and
 * answers true. It exists for callers that need the EOA signer the unlock
 * registers above rather than a signature from the provider they hold.
 */
export const OPEN_WALLET_METHOD = "dehub_openWallet";
