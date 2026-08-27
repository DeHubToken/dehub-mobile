/**
 * Content gate regression tests.
 * ==============================
 * Pinned to a REAL `plansDetails` payload copied out of
 * `GET https://api.dehub.io/api/feed` (post 5228), not to a hand-made object
 * matching whatever the interface happens to say. That distinction is the whole
 * point of this file: the `SubscriberPlan` interface used to declare
 * `{ id: number; title: string; price: number }` and the server sends none of
 * those three. Nothing caught it, because every test and every caller agreed
 * with the interface rather than with the API.
 *
 * The two bugs this locks down, both from post 5228:
 *  1. `plan.price` is undefined (the price is per-chain), so web's feed cards
 *     rendered `Subscribe from 0 DHB` — NaN through a formatter that maps
 *     non-finite to "0".
 *  2. The post was gated behind two UNPUBLISHED plans, whose Subscribe button
 *     is permanently disabled, so the post could never be opened by anyone.
 *
 * Has to stay in step with dehubweb's `src/lib/__tests__/content-gate.test.ts`
 * — both apps decide the same gate about the same post, so if they drift, one
 * of them hides a post the other shows.
 */
import {
  isHoldGated,
  isSubscriberGated,
  isSubscriberPlanBuyable,
  subscriberPlanPrice,
  cheapestSubscriberPlan,
  type SubscriberPlan,
} from "../../libs/content-gate";

/** Verbatim from the feed, trimmed to the fields the client reads. */
const UNPUBLISHED_PLAN: SubscriberPlan = {
  _id: "699f984555a6771ce282136b",
  id: "31",
  name: "F",
  duration: 3,
  chains: [
    {
      chainId: 8453,
      token: "0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c",
      price: 36,
      isPublished: false,
      status: false,
    },
  ],
  alreadySubscribed: false,
};

const PUBLISHED_PLAN: SubscriberPlan = {
  id: "32",
  name: "F",
  chains: [{ chainId: 8453, price: 96, isPublished: true, status: true }],
  alreadySubscribed: false,
};

describe("the real feed payload", () => {
  it("has no top-level price — the field web used to read", () => {
    expect((UNPUBLISHED_PLAN as { price?: number }).price).toBeUndefined();
    expect(subscriberPlanPrice(UNPUBLISHED_PLAN)).toBe(36);
  });

  it("names the plan `name`, never `title`", () => {
    expect(UNPUBLISHED_PLAN.name).toBe("F");
    expect((UNPUBLISHED_PLAN as { title?: string }).title).toBeUndefined();
  });
});

describe("isSubscriberPlanBuyable", () => {
  it("is false when no chain is published", () => {
    expect(isSubscriberPlanBuyable(UNPUBLISHED_PLAN)).toBe(false);
  });

  it("is true when a chain is published", () => {
    expect(isSubscriberPlanBuyable(PUBLISHED_PLAN)).toBe(true);
  });

  it("prefers an explicit top-level isPublished when the server sends one", () => {
    expect(isSubscriberPlanBuyable({ isPublished: true, chains: [] })).toBe(true);
    expect(
      isSubscriberPlanBuyable({ isPublished: false, chains: [{ isPublished: true }] }),
    ).toBe(false);
  });
});

describe("isSubscriberGated", () => {
  it("does not gate post 5228 — every plan on it is an unbuyable draft", () => {
    expect(
      isSubscriberGated([UNPUBLISHED_PLAN, { ...UNPUBLISHED_PLAN, id: "32" }], false),
    ).toBe(false);
  });

  it("gates when at least one plan is buyable and unsubscribed", () => {
    expect(isSubscriberGated([UNPUBLISHED_PLAN, PUBLISHED_PLAN], false)).toBe(true);
  });

  it("opens for a subscriber", () => {
    expect(
      isSubscriberGated([{ ...PUBLISHED_PLAN, alreadySubscribed: true }], false),
    ).toBe(false);
  });

  it("opens for the owner, and for an empty or missing plan list", () => {
    expect(isSubscriberGated([PUBLISHED_PLAN], true)).toBe(false);
    expect(isSubscriberGated([], false)).toBe(false);
    expect(isSubscriberGated(undefined, false)).toBe(false);
  });
});

describe("cheapestSubscriberPlan", () => {
  it("picks the lowest price, not merely the first entry", () => {
    const cheap = {
      ...PUBLISHED_PLAN,
      id: "cheap",
      chains: [{ price: 10, isPublished: true }],
    };
    expect(cheapestSubscriberPlan([PUBLISHED_PLAN, cheap])?.id).toBe("cheap");
  });

  it("ignores plans nobody can buy, so no price is shown for a disabled button", () => {
    expect(cheapestSubscriberPlan([UNPUBLISHED_PLAN])).toBeUndefined();
  });

  it("returns undefined rather than a plan with no resolvable price", () => {
    expect(
      subscriberPlanPrice(cheapestSubscriberPlan([{ isPublished: true, chains: [] }])),
    ).toBeUndefined();
  });
});

describe("isHoldGated", () => {
  it("needs a positive amount — the paired bug on streamInfo", () => {
    expect(isHoldGated(true, undefined)).toBe(false);
    expect(isHoldGated(true, 0)).toBe(false);
    expect(isHoldGated(true, "250")).toBe(true);
    expect(isHoldGated(false, 250)).toBe(false);
  });
});
