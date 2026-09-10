import { ChainId } from "../config/constants";
import { dhbForUsd, subscriptionPaymentToken } from "../libs/subscription-pricing";

describe("subscription pricing", () => {
  it("turns a fixed dollar price into a live DHB quote", () => {
    expect(dhbForUsd(10, 0.0005)).toBe(20_000);
  });

  it("does not invent a quote when the live price is unavailable", () => {
    expect(dhbForUsd(10, 0)).toBeNull();
  });

  it("uses each chain's USDT precision", () => {
    expect(subscriptionPaymentToken(ChainId.BASE_MAINNET)?.decimals).toBe(6);
    expect(subscriptionPaymentToken(ChainId.BSC_MAINNET)?.decimals).toBe(18);
  });
});
