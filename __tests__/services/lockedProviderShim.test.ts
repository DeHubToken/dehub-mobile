import { createLockedEip1193, isSigningMethod } from "../../services/auth/lockedProviderShim";
import { requestWalletUnlock, WalletLockedError } from "../../libs/wallet-lock";

const send = jest.fn(async (_method: string, _params: any[]) => "0xrpc");

jest.mock("../../libs/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock("../../libs/wallet-lock", () => {
  class WalletLockedError extends Error {
    constructor(message = "locked") {
      super(message);
      this.name = "WalletLockedError";
    }
  }
  return {
    WalletLockedError,
    requestWalletUnlock: jest.fn(),
  };
});

jest.mock("../../services/ethers.service", () => ({
  ethersService: { getProvider: () => ({ send }) },
}));

jest.mock("../../config/constants", () => ({ defaultChainId: 8453 }));

const askUnlock = requestWalletUnlock as jest.MockedFunction<typeof requestWalletUnlock>;

const ADDRESS = "0xc2d2316df4fbcae45a8d9fb3bcb4f36af7c55e4e";

describe("lockedProviderShim", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("classifies only the methods that genuinely need the key", () => {
    expect(isSigningMethod("personal_sign")).toBe(true);
    expect(isSigningMethod("eth_sendTransaction")).toBe(true);
    expect(isSigningMethod("private_key")).toBe(true);
    // Previewing what a tip would cost must never ask for a fingerprint.
    expect(isSigningMethod("eth_estimateGas")).toBe(false);
    expect(isSigningMethod("eth_getBalance")).toBe(false);
  });

  it("answers identity and chain without asking anything", async () => {
    const shim = createLockedEip1193(ADDRESS, 8453, async () => null);

    await expect(shim.request({ method: "eth_accounts" })).resolves.toEqual([ADDRESS]);
    await expect(shim.request({ method: "eth_requestAccounts" })).resolves.toEqual([ADDRESS]);
    await expect(shim.request({ method: "eth_chainId" })).resolves.toBe("0x2105");
    expect(askUnlock).not.toHaveBeenCalled();
  });

  it("passes ordinary reads to the RPC with the wallet still shut", async () => {
    const shim = createLockedEip1193(ADDRESS, 8453, async () => null);

    await expect(
      shim.request({ method: "eth_getBalance", params: [ADDRESS, "latest"] }),
    ).resolves.toBe("0xrpc");
    expect(send).toHaveBeenCalledWith("eth_getBalance", [ADDRESS, "latest"]);
    expect(askUnlock).not.toHaveBeenCalled();
  });

  it("uses the key already on this device without opening the sheet", async () => {
    // The common case: the wallet was created or unlocked on this phone. The
    // only prompt should be the OS device-owner check that releasing the key
    // raises — never a password box.
    const real = { request: jest.fn(async () => "0xsigned") };
    const rebuild = jest.fn(async () => real);

    const shim = createLockedEip1193(ADDRESS, 8453, rebuild);
    await expect(
      shim.request({ method: "personal_sign", params: ["0xdead", ADDRESS] }),
    ).resolves.toBe("0xsigned");

    expect(askUnlock).not.toHaveBeenCalled();
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(real.request).toHaveBeenCalledWith({
      method: "personal_sign",
      params: ["0xdead", ADDRESS],
    });
  });

  it("falls back to the sheet only when the device has no key", async () => {
    const real = { request: jest.fn(async () => "0xsigned") };
    const rebuild = jest
      .fn<Promise<typeof real | null>, []>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(real);
    askUnlock.mockResolvedValue(true);

    const shim = createLockedEip1193(ADDRESS, 8453, rebuild as any);
    await expect(shim.request({ method: "personal_sign", params: [] })).resolves.toBe(
      "0xsigned",
    );

    expect(askUnlock).toHaveBeenCalledTimes(1);
    expect(rebuild).toHaveBeenCalledTimes(2);
  });

  it("lets a declined device-owner check refuse the signature outright", async () => {
    // Saying no to a fingerprint means no. It must not fall through to a
    // password sheet, which would read as the app shopping for another way in.
    const rebuild = jest.fn(async () => {
      throw new Error("BiometricRejected");
    });

    const shim = createLockedEip1193(ADDRESS, 8453, rebuild as any);
    await expect(shim.request({ method: "personal_sign", params: [] })).rejects.toThrow(
      "BiometricRejected",
    );
    expect(askUnlock).not.toHaveBeenCalled();
  });

  it("unlocks once per session, not once per signature", async () => {
    const real = { request: jest.fn(async () => "0xsigned") };
    const rebuild = jest.fn(async () => real);

    const shim = createLockedEip1193(ADDRESS, 8453, rebuild);
    await shim.request({ method: "personal_sign", params: [] });
    await shim.request({ method: "eth_sendTransaction", params: [{}] });
    await shim.request({ method: "eth_getBalance", params: [] });

    expect(rebuild).toHaveBeenCalledTimes(1);
    // Once unlocked the shim is transparent — even reads go to the real
    // provider, so the session behaves exactly like one that never locked.
    expect(real.request).toHaveBeenCalledTimes(3);
    expect(send).not.toHaveBeenCalled();
  });

  it("reports a dismissed sheet as a refusal, not a broken provider", async () => {
    const rebuild = jest.fn(async () => null);
    askUnlock.mockResolvedValue(false);

    const shim = createLockedEip1193(ADDRESS, 8453, rebuild);
    await expect(shim.request({ method: "personal_sign", params: [] })).rejects.toBeInstanceOf(
      WalletLockedError,
    );
    // Probed the device, found nothing, asked — and stopped when told no.
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it("refuses rather than looping when the unlock left no key behind", async () => {
    askUnlock.mockResolvedValue(true);
    const rebuild = jest.fn(async () => null);

    const shim = createLockedEip1193(ADDRESS, 8453, rebuild);
    await expect(shim.request({ method: "private_key" })).rejects.toBeInstanceOf(
      WalletLockedError,
    );
    expect(rebuild).toHaveBeenCalledTimes(2);
  });

  it("rebuilds once for signatures fired back to back", async () => {
    const real = { request: jest.fn(async () => "0xsigned") };
    const rebuild = jest.fn(async () => real);

    const shim = createLockedEip1193(ADDRESS, 8453, rebuild);
    await Promise.all([
      shim.request({ method: "personal_sign", params: [] }),
      shim.request({ method: "eth_sendTransaction", params: [{}] }),
    ]);

    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default chain when the session names none", async () => {
    const shim = createLockedEip1193(ADDRESS, 0, async () => null);
    await expect(shim.request({ method: "eth_chainId" })).resolves.toBe("0x2105");
  });
});
