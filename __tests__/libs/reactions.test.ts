import {
  isPositiveReaction,
  reactionForTap,
  resolveLeadReaction,
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
