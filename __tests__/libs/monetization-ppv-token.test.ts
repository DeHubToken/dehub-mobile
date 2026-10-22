import { buildStreamInfo, validateMonetization } from "../../libs/monetization";

const state = (tokenSymbol?: string): any => ({
  ppvEnabled: true,
  ppvData: { price: "5", tokenSymbol },
  bountyEnabled: false,
  bountyData: { viewers: "", commenters: "", rewardPerPerson: "" },
  tokenGatedEnabled: false,
  tokenGateData: { minAmount: "" },
});

describe("pay-per-view token", () => {
  it("prices a Base post in USDC with its contract", () => {
    const info = buildStreamInfo(state("USDC"), 8453, 8453);
    expect(info.payPerViewTokenSymbol).toBe("USDC");
    expect(info.payPerViewContractAddress).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  });

  it("keeps DHB posts on DHB", () => {
    const info = buildStreamInfo(state(undefined), 56, 56);
    expect(info.payPerViewTokenSymbol).toBe("DHB");
    expect(info.payPerViewContractAddress).toBeUndefined();
  });

  it("refuses USDC on a chain without it", () => {
    expect(validateMonetization(state("USDC"), 1)).toMatch(/USDC/);
    expect(validateMonetization(state("USDT"), 56)).toBeNull();
  });
});
