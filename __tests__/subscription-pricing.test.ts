import { ChainId } from "../config/constants";
import {
  DHB_PRELISTING_USD,
  dhbForUsd,
  formatDhbPayment,
  subscriptionPaymentToken,
} from "../libs/subscription-pricing";

describe("subscription pricing", () => {
  it("turns a fixed dollar price into a live DHB quote", () => {
    expect(dhbForUsd(10, 0.0005)).toBe(20_000);
  });

  it("does not invent a quote when the live price is unavailable", () => {
    expect(dhbForUsd(10, 0)).toBeNull();
  });

  it("shows the exact fixed-peg DHB payment without an approximation mark", () => {
    expect(dhbForUsd(10, DHB_PRELISTING_USD)).toBe(10_000);
    expect(formatDhbPayment(10_000)).toBe("10,000 DHB");
  });

  it("uses each chain's USDT precision", () => {
    expect(subscriptionPaymentToken(ChainId.BASE_MAINNET)?.decimals).toBe(6);
    expect(subscriptionPaymentToken(ChainId.BSC_MAINNET)?.decimals).toBe(18);
  });
});
