type Relay = {
  connected?: boolean;
  restartTransport: () => Promise<void>;
  transportOpen?: () => Promise<void>;
};

/** Refresh a persisted WalletConnect socket before a request opens another app. */
export async function prepareWalletRelay(provider: any): Promise<void> {
  const relay: Relay | undefined = provider?.signer?.client?.core?.relayer
    ?? provider?.client?.core?.relayer;
  if (typeof relay?.restartTransport !== 'function') return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        await relay.restartTransport();
        // restartTransport can return while an existing connect is in progress.
        if (relay.connected === false && relay.transportOpen) await relay.transportOpen();
        if (relay.connected === false) throw new Error('Wallet relay is disconnected');
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Wallet connection timed out')), 15_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function isWalletRelayPublishError(error: unknown): boolean {
  let current: any = error;
  for (let depth = 0; current && depth < 5; depth++, current = current.cause) {
    if (current.code === 4001 || current.code === 'ACTION_REJECTED') return false;
    if (/Failed to publish payload/i.test(current.message ?? '')) return true;
  }
  return false;
}

/** A missing wallet response must release the login controls without replaying it. */
export async function waitForWalletSignature<T>(request: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Wallet signature timed out')), 120_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
