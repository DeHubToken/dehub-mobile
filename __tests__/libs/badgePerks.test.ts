import { BADGE_ORDER } from "../../libs/misc";
import { badgePerksForIndex, formatBytes, platformFeeForIndex } from "../../libs/badgePerks";
import { tierForBadgeImage } from "../../libs/badgeShowcase";

describe("badge perks", () => {
  it("matches the web fee table: 0.69% off per rung, Megalodon at 1%", () => {
    expect(platformFeeForIndex(-1)).toBe(10);
    expect(platformFeeForIndex(0)).toBe(9.31);
    expect(platformFeeForIndex(11)).toBe(1.72);
    expect(platformFeeForIndex(12)).toBe(1);
  });

  it("never gets worse climbing a rung", () => {
    for (let i = 0; i < BADGE_ORDER.length; i++) {
      const lower = badgePerksForIndex(i - 1);
      const higher = badgePerksForIndex(i);
      expect(higher.tier).toBe(BADGE_ORDER[i]);
      expect(higher.platformFee).toBeLessThan(lower.platformFee);
      expect(higher.voteWeight).toBeGreaterThan(lower.voteWeight);
      expect(higher.reach).toBeGreaterThan(lower.reach);
      expect(higher.feedPostsPerDay).toBeGreaterThanOrEqual(lower.feedPostsPerDay);
      expect(higher.imagesPerPost).toBeGreaterThanOrEqual(lower.imagesPerPost);
      expect(higher.editorStorageBytes).toBeGreaterThan(lower.editorStorageBytes);
      expect(higher.savedProfiles).toBeGreaterThanOrEqual(lower.savedProfiles);
    }
  });

  it("prints byte counts the way the perk tiles show them", () => {
    expect(formatBytes(1.1 * 1024 ** 3)).toBe("1.1 GB");
    expect(formatBytes(750 * 1024 ** 3)).toBe("750 GB");
    expect(formatBytes(5 * 1024 ** 4)).toBe("5 TB");
  });

  // Every image resolves to one file stub under jest, so only the empty case
  // can be told apart here.
  it("has no tier for a missing badge", () => {
    expect(tierForBadgeImage(undefined)).toBeNull();
    expect(tierForBadgeImage(null)).toBeNull();
  });
});
