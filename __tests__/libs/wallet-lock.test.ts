import {
  registerWalletUnlockHandler,
  requestWalletUnlock,
  hasWalletUnlockHandler,
  WalletLockedError,
} from "../../libs/wallet-lock";

jest.mock("../../libs/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("wallet-lock", () => {
  let unregister: (() => void) | null = null;

  afterEach(() => {
    unregister?.();
    unregister = null;
  });

  it("refuses when nothing is mounted to ask", async () => {
    expect(hasWalletUnlockHandler()).toBe(false);
    await expect(requestWalletUnlock("personal_sign")).resolves.toBe(false);
  });

  it("returns whatever the host decided", async () => {
    unregister = registerWalletUnlockHandler(async () => true);
    await expect(requestWalletUnlock("personal_sign")).resolves.toBe(true);

    unregister();
    unregister = registerWalletUnlockHandler(async () => false);
    await expect(requestWalletUnlock("personal_sign")).resolves.toBe(false);
  });

  it("shows one sheet for calls that arrive together", async () => {
    // A single "post" fans out into several signing calls; each raising its own
    // copy of the sheet would make the user answer the same question repeatedly.
    let release: (v: boolean) => void = () => {};
    const handler = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    );
    unregister = registerWalletUnlockHandler(handler);

    const a = requestWalletUnlock("eth_sendTransaction");
    const b = requestWalletUnlock("personal_sign");
    release(true);

    await expect(a).resolves.toBe(true);
    await expect(b).resolves.toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("asks again after the previous prompt has settled", async () => {
    const handler = jest.fn(async () => true);
    unregister = registerWalletUnlockHandler(handler);

    await requestWalletUnlock("personal_sign");
    await requestWalletUnlock("personal_sign");

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("treats a throwing host as a refusal rather than propagating", async () => {
    unregister = registerWalletUnlockHandler(async () => {
      throw new Error("sheet exploded");
    });
    await expect(requestWalletUnlock("personal_sign")).resolves.toBe(false);
  });

  it("does not let a late unmount clear a newer host", async () => {
    // The root can remount before the outgoing tree finishes tearing down.
    // Clearing unconditionally there would leave the app with no way to ask.
    const stale = registerWalletUnlockHandler(async () => false);
    unregister = registerWalletUnlockHandler(async () => true);
    stale();

    expect(hasWalletUnlockHandler()).toBe(true);
    await expect(requestWalletUnlock("personal_sign")).resolves.toBe(true);
  });

  it("names itself so callers can tell a refusal from a failure", () => {
    const e = new WalletLockedError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("WalletLockedError");
  });
});
