// Simple module-scoped registry for a temporary signing provider
// Used to supply an EIP-1193 compatible provider to auth signature flow

let currentSigningProvider: any | null = null;

export function setSigningProvider(provider: any | null) {
  currentSigningProvider = provider || null;
}

export function getSigningProvider(): any | null {
  return currentSigningProvider;
}

export function clearSigningProvider() {
  currentSigningProvider = null;
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

export function setEoaSigningProvider(provider: any | null) {
  currentEoaSigningProvider = provider || null;
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
