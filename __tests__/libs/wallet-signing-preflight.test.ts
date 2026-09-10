import { prepareWalletForQueuedMint } from "../../libs/wallet-signing-preflight";

describe("prepareWalletForQueuedMint", () => {
  it("asks the locked provider to open the wallet", async () => {
    const request = jest.fn().mockResolvedValue(true);

    await expect(prepareWalletForQueuedMint({ request })).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith({ method: "dehub_openWallet" });
  });

  it("stops the queued job when the unlock is declined", async () => {
    const locked = Object.assign(new Error("Your wallet is locked"), {
      name: "WalletLockedError",
    });

    await expect(
      prepareWalletForQueuedMint({ request: jest.fn().mockRejectedValue(locked) }),
    ).rejects.toBe(locked);
  });

  it("leaves providers that do not know DeHub's private method alone", async () => {
    const unsupported = new Error("Unsupported method: dehub_openWallet");

    await expect(
      prepareWalletForQueuedMint({ request: jest.fn().mockRejectedValue(unsupported) }),
    ).resolves.toBeUndefined();
  });
});
