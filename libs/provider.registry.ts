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
