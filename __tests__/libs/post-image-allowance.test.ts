import { getPostImageLimitForBadge } from "../../libs/post-image-allowance";

describe("getPostImageLimitForBadge", () => {
  it("keeps the four-image baseline for accounts without a badge", () => {
    expect(getPostImageLimitForBadge(0)).toBe(4);
  });

  it("scales steadily through the badge ladder and caps Meglodon at 20", () => {
    expect(getPostImageLimitForBadge(10_000)).toBe(5);
    expect(getPostImageLimitForBadge(5_000_000)).toBe(14);
    expect(getPostImageLimitForBadge(25_000_000)).toBe(18);
    expect(getPostImageLimitForBadge(50_000_000)).toBe(20);
  });
});
