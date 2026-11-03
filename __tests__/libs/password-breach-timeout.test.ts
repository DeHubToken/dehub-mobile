jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA1: "SHA-1" },
  digestStringAsync: jest.fn(async () => "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8"),
}));

import { BREACH_CHECK_TIMEOUT_MS, isBreached } from "../../libs/wallet-core/passwordStrength";

describe("isBreached", () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it("gives up and fails open when the breach service never answers", async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    global.fetch = jest.fn((_url: any, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    }) as any;

    const result = isBreached("correct horse battery staple");
    await jest.advanceTimersByTimeAsync(BREACH_CHECK_TIMEOUT_MS);

    await expect(result).resolves.toBeNull();
    expect(signal?.aborted).toBe(true);
  });

  it("still reports a breached password when the service answers", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => "1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\n0000000000000000000000000000000000A:0",
    })) as any;

    await expect(isBreached("password")).resolves.toBe(true);
  });
});
