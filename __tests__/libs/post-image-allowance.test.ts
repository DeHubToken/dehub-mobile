import { getPostImageLimitForBadge } from "../../libs/post-image-allowance";

describe("getPostImageLimitForBadge", () => {
  it("keeps the four-image baseline for accounts without a badge", () => {
    expect(getPostImageLimitForBadge(0)).toBe(4);
  });

  it("gives every badge holder at least 30 and caps Megalodon at 40", () => {
    expect(getPostImageLimitForBadge(10_000)).toBe(30);
    expect(getPostImageLimitForBadge(5_000_000)).toBe(37);
    expect(getPostImageLimitForBadge(25_000_000)).toBe(39);
    expect(getPostImageLimitForBadge(50_000_000)).toBe(40);
  });
});
