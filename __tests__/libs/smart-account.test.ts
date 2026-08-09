/**
 * setupAAProvider never throws — it returns null and drops the caller onto a
 * plain EOA. These tests pin the outcome record that makes that fallback
 * visible, because without it a sponsorship failure looks exactly like a user
 * who ran out of gas.
 */

const mockInvoke = jest.fn();
const mockGetProviderInstance = jest.fn();
const mockSetupProvider = jest.fn();

jest.mock('../../services/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

jest.mock('@web3auth/base', () => ({
  CHAIN_NAMESPACES: { EIP155: 'eip155' },
}));

jest.mock('@web3auth/ethereum-provider', () => ({
  EthereumPrivateKeyProvider: class {
    setupProvider(...args: unknown[]) {
      return mockSetupProvider(...args);
    }
  },
}));

jest.mock('@web3auth/account-abstraction-provider', () => ({
  AccountAbstractionProvider: {
    getProviderInstance: (...args: unknown[]) => mockGetProviderInstance(...args),
  },
  SafeSmartAccount: class {},
}));

import {
  setupAAProvider,
  clearAAProviders,
  isChainAASupported,
  hasAASetupFailed,
  getAASetupOutcome,
} from '../../libs/wallet-core/smart-account';

const BASE = 8453;
const BNB = 56;
const ETH_MAINNET = 1;
const PK = '0x' + '11'.repeat(32);
const EOA = '0xEOAeoaEOAeoaEOAeoaEOAeoaEOAeoaEOAeoa1111';
const SAFE = '0xSAFEsafeSAFEsafeSAFEsafeSAFEsafeSAFE2222';

const okConfig = {
  data: {
    bundlerUrl: 'https://api.pimlico.io/v2/8453/rpc?apikey=test',
    paymasterUrl: 'https://api.pimlico.io/v2/8453/rpc?apikey=test',
  },
  error: null,
};

/** An AA provider whose eth_accounts resolves to a Safe address. */
const providerReturning = (accounts: string[]) => ({
  request: jest.fn().mockResolvedValue(accounts),
  on: jest.fn(),
  removeListener: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
  // Wipes both the provider cache and the outcome map, so each case starts
  // from "never attempted".
  clearAAProviders();
  mockSetupProvider.mockResolvedValue(undefined);
});

describe('isChainAASupported', () => {
  it('covers the chains DeHub deploys to', () => {
    expect(isChainAASupported(BASE)).toBe(true);
    expect(isChainAASupported(BNB)).toBe(true);
  });

  it('excludes chains with no Safe/Pimlico setup', () => {
    expect(isChainAASupported(ETH_MAINNET)).toBe(false);
    expect(isChainAASupported(999999)).toBe(false);
  });
});

describe('hasAASetupFailed', () => {
  it('is false before any attempt — an untried chain proves nothing', () => {
    expect(hasAASetupFailed(BASE)).toBe(false);
    expect(getAASetupOutcome(BASE)).toBeNull();
  });

  it('is true once setup demonstrably failed', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(setupAAProvider(EOA, PK, BASE)).resolves.toBeNull();

    expect(hasAASetupFailed(BASE)).toBe(true);
    expect(getAASetupOutcome(BASE)).toMatchObject({
      ok: false,
      reason: 'config-unavailable',
    });
  });

  it('is false after a successful setup', async () => {
    mockInvoke.mockResolvedValue(okConfig);
    mockGetProviderInstance.mockResolvedValue(providerReturning([SAFE]));

    await expect(setupAAProvider(EOA, PK, BASE)).resolves.not.toBeNull();

    expect(hasAASetupFailed(BASE)).toBe(false);
    expect(getAASetupOutcome(BASE)).toEqual({ ok: true, safeAddress: SAFE });
  });
});

describe('setupAAProvider outcome reasons', () => {
  it('records unsupported-chain without touching the network', async () => {
    await expect(setupAAProvider(EOA, PK, ETH_MAINNET)).resolves.toBeNull();

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(getAASetupOutcome(ETH_MAINNET)).toEqual({
      ok: false,
      reason: 'unsupported-chain',
    });
  });

  it('records config-unavailable when the edge function returns no URLs', async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });

    await expect(setupAAProvider(EOA, PK, BASE)).resolves.toBeNull();

    expect(getAASetupOutcome(BASE)).toMatchObject({ reason: 'config-unavailable' });
  });

  it('records address-unresolved when the Safe address never comes back', async () => {
    mockInvoke.mockResolvedValue(okConfig);
    mockGetProviderInstance.mockResolvedValue(providerReturning([]));

    await expect(setupAAProvider(EOA, PK, BASE)).resolves.toBeNull();

    expect(getAASetupOutcome(BASE)).toMatchObject({ reason: 'address-unresolved' });
  });

  it('records setup-failed when the AA SDK throws', async () => {
    mockInvoke.mockResolvedValue(okConfig);
    mockGetProviderInstance.mockRejectedValue(new Error('bundler unreachable'));

    await expect(setupAAProvider(EOA, PK, BASE)).resolves.toBeNull();

    expect(getAASetupOutcome(BASE)).toMatchObject({
      ok: false,
      reason: 'setup-failed',
      detail: 'bundler unreachable',
    });
  });
});

describe('provider behaviour', () => {
  it('answers eth_accounts from the memoized Safe address, lowercased', async () => {
    mockInvoke.mockResolvedValue(okConfig);
    const raw = providerReturning([SAFE]);
    mockGetProviderInstance.mockResolvedValue(raw);

    const provider = await setupAAProvider(EOA, PK, BASE);
    raw.request.mockClear();

    await expect(provider!.request({ method: 'eth_accounts' })).resolves.toEqual([
      SAFE.toLowerCase(),
    ]);
    await expect(provider!.request({ method: 'eth_requestAccounts' })).resolves.toEqual([
      SAFE.toLowerCase(),
    ]);
    // Neither call round-tripped through the AA SDK.
    expect(raw.request).not.toHaveBeenCalled();
  });

  it('passes any other method straight through', async () => {
    mockInvoke.mockResolvedValue(okConfig);
    const raw = providerReturning([SAFE]);
    mockGetProviderInstance.mockResolvedValue(raw);

    const provider = await setupAAProvider(EOA, PK, BASE);
    raw.request.mockClear();
    raw.request.mockResolvedValue('0x2105');

    await expect(provider!.request({ method: 'eth_chainId' })).resolves.toBe('0x2105');
    expect(raw.request).toHaveBeenCalledWith({ method: 'eth_chainId', params: undefined });
  });

  it('reuses the cached provider for the same address and chain', async () => {
    mockInvoke.mockResolvedValue(okConfig);
    mockGetProviderInstance.mockResolvedValue(providerReturning([SAFE]));

    const first = await setupAAProvider(EOA, PK, BASE);
    const second = await setupAAProvider(EOA, PK, BASE);

    expect(second).toBe(first);
    expect(mockGetProviderInstance).toHaveBeenCalledTimes(1);
  });
});

describe('clearAAProviders', () => {
  it('drops recorded outcomes so a previous session cannot block the next post', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await setupAAProvider(EOA, PK, BASE);
    expect(hasAASetupFailed(BASE)).toBe(true);

    clearAAProviders();

    expect(hasAASetupFailed(BASE)).toBe(false);
    expect(getAASetupOutcome(BASE)).toBeNull();
  });
});
