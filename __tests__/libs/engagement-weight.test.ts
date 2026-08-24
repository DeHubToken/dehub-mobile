/**
 * The ladder has to match the API's, because the API is what actually counts
 * the reaction — a client that guesses higher shows a number that snaps back.
 */
import {
  MAX_ENGAGEMENT_WEIGHT,
  NO_BADGE_ENGAGEMENT_WEIGHT,
  appliedEngagementWeight,
  engagementWeight,
  engagementWeightForBadge,
  formatEngagementWeight,
} from "../../libs/engagement-weight";
import { BADGE_ORDER } from "../../libs/misc";
import { applyReactionDelta } from "../../libs/reactions";

describe("engagementWeightForBadge", () => {
  it("counts an account with no badge once", () => {
    expect(engagementWeightForBadge(null)).toBe(1);
    expect(engagementWeightForBadge(undefined)).toBe(1);
    expect(NO_BADGE_ENGAGEMENT_WEIGHT).toBe(1);
  });

  it("counts the entry tier twice and adds one a rung after that", () => {
    expect(engagementWeightForBadge("Crab")).toBe(2);
    expect(engagementWeightForBadge("Lobster")).toBe(3);
    expect(engagementWeightForBadge("Piranha")).toBe(4);
  });

  it("tops out at fourteen", () => {
    expect(engagementWeightForBadge("Meglodon")).toBe(14);
    expect(MAX_ENGAGEMENT_WEIGHT).toBe(14);
  });

  it("rises by exactly one a rung, with no gaps", () => {
    expect(BADGE_ORDER.map(engagementWeightForBadge)).toEqual(
      BADGE_ORDER.map((_, i) => i + 2),
    );
  });

  it("weighs a tier it does not recognise at one", () => {
    expect(engagementWeightForBadge("Kraken")).toBe(1);
  });
});

describe("engagementWeight", () => {
  it("resolves from a balance through the same ladder that draws the badge", () => {
    expect(engagementWeight(0)).toBe(1);
    expect(engagementWeight(9_999)).toBe(1);
    expect(engagementWeight(10_000)).toBe(2);
    expect(engagementWeight(50_000_000)).toBe(14);
  });

  it("honours a grandfathered tier", () => {
    expect(
      engagementWeight(10_000, { lock: { tier: "Cobra", requirement: 10_000 } }),
    ).toBe(6);
  });

  it("treats a missing balance as no badge", () => {
    expect(engagementWeight(null)).toBe(1);
    expect(engagementWeight(undefined)).toBe(1);
  });
});

describe("appliedEngagementWeight", () => {
  it("reads a weight off a response, clamped into the ladder", () => {
    expect(appliedEngagementWeight(3)).toBe(3);
    expect(appliedEngagementWeight("3")).toBe(3);
    expect(appliedEngagementWeight(0)).toBe(1);
    expect(appliedEngagementWeight(9_999)).toBe(14);
    expect(appliedEngagementWeight(undefined)).toBe(1);
  });
});

describe("formatEngagementWeight", () => {
  it("reads as a multiplier", () => {
    expect(formatEngagementWeight(1)).toBe("×1");
    expect(formatEngagementWeight(14)).toBe("×14");
  });

  it("never shows less than ×1", () => {
    expect(formatEngagementWeight(0)).toBe("×1");
    expect(formatEngagementWeight(Number.NaN)).toBe("×1");
  });
});

describe("applyReactionDelta at weight", () => {
  it("moves the per-reaction split by the weight, not by one", () => {
    expect(applyReactionDelta({}, null, "love", 3)).toEqual({ love: 3 });
    expect(applyReactionDelta({ like: 6, love: 3 }, "like", "love", 3)).toEqual({
      like: 3,
      love: 6,
    });
    expect(applyReactionDelta({ hot: 4 }, "hot", null, 4)).toEqual({ hot: 0 });
  });

  it("still defaults to one", () => {
    expect(applyReactionDelta({}, null, "love")).toEqual({ love: 1 });
  });

  it("never drives a count below zero", () => {
    expect(applyReactionDelta({ like: 2 }, "like", null, 14)).toEqual({ like: 0 });
  });
});
