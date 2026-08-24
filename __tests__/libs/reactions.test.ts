import {
  isPositiveReaction,
  reactionForTap,
  reconcileReactionCounts,
  resolveLeadReaction,
  resolveReactionCounts,
  POST_REACTIONS,
} from "../../libs/reactions";

describe("reaction taxonomy", () => {
  it("treats only dislike and poo as negative", () => {
    expect(POST_REACTIONS.filter((key) => !isPositiveReaction(key))).toEqual([
      "dislike",
      "poo",
    ]);
  });
});

describe("resolveLeadReaction", () => {
  it("wears the most-used reaction", () => {
    expect(resolveLeadReaction({ like: 3, love: 9 })).toBe("love");
  });

  it("wears the plain thumbs-up when likes lead", () => {
    expect(resolveLeadReaction({ like: 9, love: 3 })).toBeNull();
    expect(resolveLeadReaction({})).toBeNull();
    expect(resolveLeadReaction(null)).toBeNull();
  });

  it("breaks ties by picker order", () => {
    expect(resolveLeadReaction({ like: 4, love: 4 })).toBeNull();
    expect(resolveLeadReaction({ love: 4, hot: 4 })).toBe("love");
  });

  it("never wears a negative reaction — that is the thumbs-down's", () => {
    expect(resolveLeadReaction({ like: 1, poo: 9 })).toBeNull();
    expect(resolveLeadReaction({ love: 1, dislike: 9 })).toBe("love");
    expect(resolveLeadReaction({ hot: 3 }, "poo")).toBe("hot");
  });

  it("lets the viewer's own reaction outrank the crowd's", () => {
    expect(resolveLeadReaction({ like: 40 }, "lol")).toBe("lol");
    expect(resolveLeadReaction({ love: 40 }, "like")).toBeNull();
  });
});

describe("reactionForTap", () => {
  it("casts the reaction the thumb is wearing, not a plain like", () => {
    expect(reactionForTap(true, null, { hot: 12, like: 3 })).toBe("hot");
    expect(reactionForTap(true, null, { love: 2 })).toBe("love");
  });

  it("falls back to like when the thumb draws the plain icon", () => {
    expect(reactionForTap(true, null, { like: 9, hot: 2 })).toBe("like");
    expect(reactionForTap(true, null, {})).toBe("like");
    expect(reactionForTap(true, null, null)).toBe("like");
  });

  it("re-sends the held reaction, which is how the server un-reacts it", () => {
    expect(reactionForTap(true, "lol", { hot: 40 })).toBe("lol");
    expect(reactionForTap(true, "like", { hot: 40 })).toBe("like");
    expect(reactionForTap(false, "poo", {})).toBe("poo");
    expect(reactionForTap(false, "dislike", {})).toBe("dislike");
  });

  it("keeps the thumbs-down a plain dislike — it never wears a glyph", () => {
    expect(reactionForTap(false, null, { hot: 40 })).toBe("dislike");
    expect(reactionForTap(false, "hot", { hot: 40 })).toBe("dislike");
  });

  it("switches polarity to whatever the thumb shows", () => {
    expect(reactionForTap(true, "poo", { hot: 5 })).toBe("hot");
    expect(reactionForTap(true, "poo", { like: 5 })).toBe("like");
  });
});

describe("reconcileReactionCounts", () => {
  // Same cases as web's src/lib/__tests__/reactions.test.ts. The two files must
  // agree exactly — a post's tray has to read the same on both surfaces.
  it("always sums back to the requested totals after rounding", () => {
    const counts = reconcileReactionCounts(101, 7, { like: 13, love: 5, hot: 1, dislike: 2, poo: 1 });
    const positive =
      (counts.like ?? 0) + (counts.love ?? 0) + (counts.hot ?? 0) +
      (counts.respect ?? 0) + (counts.lol ?? 0) + (counts.sad ?? 0) + (counts.cry ?? 0);
    const negative = (counts.dislike ?? 0) + (counts.poo ?? 0);
    expect(positive).toBe(101);
    expect(negative).toBe(7);
  });

  it("is deterministic for identical inputs", () => {
    const a = reconcileReactionCounts(9, 2, { like: 2, respect: 1, lol: 1, poo: 3 });
    const b = reconcileReactionCounts(9, 2, { like: 2, respect: 1, lol: 1, poo: 3 });
    expect(a).toEqual(b);
  });

  it("zeroes a side whose rollup dropped to zero", () => {
    expect(reconcileReactionCounts(0, 3, { like: 7, dislike: 1 })).toEqual({ dislike: 3 });
  });

  it("falls back to seeding when there is no stored split", () => {
    expect(reconcileReactionCounts(5, 2, null)).toEqual({ like: 5, dislike: 2 });
    expect(reconcileReactionCounts(5, 2, {})).toEqual({ like: 5, dislike: 2 });
  });

  it("keeps a split that already agrees exactly as stored", () => {
    expect(reconcileReactionCounts(6, 1, { like: 4, love: 2, dislike: 1 })).toEqual({
      like: 4,
      love: 2,
      dislike: 1,
    });
  });

  it("keeps the shape when scaling rather than collapsing to one reaction", () => {
    expect(reconcileReactionCounts(10, 0, { like: 4, love: 1 })).toEqual({ like: 8, love: 2 });
  });
});

describe("resolveReactionCounts", () => {
  it("scales a stored split up to the headline count", () => {
    // The real shape of the drift this fixes: totalVotes.for outran the split,
    // so the tray used to total 30 on mobile while web showed 97.
    const counts = resolveReactionCounts({
      totalVotes: { for: 97, against: 0 },
      reactionCounts: { like: 24, love: 6 },
    });
    expect((counts.like ?? 0) + (counts.love ?? 0)).toBe(97);
  });

  it("seeds from polarity when the post carries no split at all", () => {
    expect(resolveReactionCounts({ totalVotes: { for: 12, against: 3 } })).toEqual({
      like: 12,
      dislike: 3,
    });
  });

  it("reads a legacy array-valued likes field as a count", () => {
    expect(resolveReactionCounts({ likes: [1, 2, 3] })).toEqual({ like: 3 });
  });
});
