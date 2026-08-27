import { QueryClient } from "@tanstack/react-query";
import { mergeLiveCounts } from "../../libs/liveCounts";

/**
 * The head poll's second job. Three properties have to hold or it does more
 * harm than the stale counts it exists to fix:
 *
 *  - it patches COUNTS and nothing else, so a background refresh can never
 *    reorder the timeline or re-slice it under a reader mid-scroll;
 *  - it leaves untouched rows referentially identical, or every memoised row in
 *    the list re-renders once a minute;
 *  - it never passes itself off as a refetch, or an active feed would postpone
 *    revalidation indefinitely.
 */

const KEY = ["home-feed", { sortBy: "createdAt" }, 10];

function feed(result: any[]) {
  return { pages: [{ result, pagination: { hasMore: true } }], pageParams: [1] };
}

function rowsIn(client: QueryClient, key: unknown[] = KEY) {
  return (client.getQueryData(key) as { pages: Array<{ result: any[] }> }).pages[0].result;
}

describe("mergeLiveCounts", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it("lifts counts onto the cached card", () => {
    queryClient.setQueryData(
      KEY,
      feed([{ tokenId: 5205, name: "post", totalViews: 9, totalVotes: { for: 0, against: 0 }, commentCount: 0 }]),
    );

    mergeLiveCounts(queryClient, [
      { tokenId: 5205, totalViews: 16, totalVotes: { for: 1, against: 0 }, commentCount: 2 },
    ]);

    expect(rowsIn(queryClient)[0]).toMatchObject({
      name: "post",
      totalViews: 16,
      totalVotes: { for: 1, against: 0 },
      commentCount: 2,
    });
  });

  it("leaves order, media and unrelated fields alone", () => {
    queryClient.setQueryData(
      KEY,
      feed([
        { tokenId: 1, imageUrl: "a.jpg", totalViews: 1 },
        { tokenId: 2, imageUrl: "b.jpg", totalViews: 2 },
      ]),
    );

    // The poll returns them the other way round, with a post the feed lacks.
    mergeLiveCounts(queryClient, [
      { tokenId: 9, totalViews: 99 },
      { tokenId: 2, totalViews: 20, imageUrl: "REPLACED.jpg" },
      { tokenId: 1, totalViews: 10 },
    ]);

    const rows = rowsIn(queryClient);
    expect(rows.map((r) => r.tokenId)).toEqual([1, 2]);
    expect(rows[1].imageUrl).toBe("b.jpg");
    expect(rows.map((r) => r.totalViews)).toEqual([10, 20]);
  });

  it("never writes a viewer flag", () => {
    queryClient.setQueryData(KEY, feed([{ tokenId: 1, isLiked: true, totalViews: 1 }]));

    // A poll served without viewer fields must not un-like the card.
    mergeLiveCounts(queryClient, [{ tokenId: 1, isLiked: false, totalViews: 2 }]);

    expect(rowsIn(queryClient)[0].isLiked).toBe(true);
    expect(rowsIn(queryClient)[0].totalViews).toBe(2);
  });

  it("keeps unchanged rows referentially identical", () => {
    const still = { tokenId: 1, totalViews: 7 };
    queryClient.setQueryData(KEY, feed([still, { tokenId: 2, totalViews: 1 }]));

    mergeLiveCounts(queryClient, [
      { tokenId: 1, totalViews: 7 },
      { tokenId: 2, totalViews: 4 },
    ]);

    expect(rowsIn(queryClient)[0]).toBe(still);
  });

  it("is a no-op when nothing moved", () => {
    const before = feed([{ tokenId: 1, totalViews: 7 }]);
    queryClient.setQueryData(KEY, before);

    mergeLiveCounts(queryClient, [{ tokenId: 1, totalViews: 7 }]);

    expect(queryClient.getQueryData(KEY)).toBe(before);
  });

  it("patches every feed root holding the post", () => {
    const imagesKey = ["home-images", {}, 20];
    const profileKey = ["infinite-feed", "0xabc"];
    queryClient.setQueryData(KEY, feed([{ tokenId: 5205, totalViews: 9 }]));
    queryClient.setQueryData(imagesKey, feed([{ tokenId: 5205, totalViews: 9 }]));
    queryClient.setQueryData(profileKey, feed([{ tokenId: 5205, totalViews: 9 }]));

    mergeLiveCounts(queryClient, [{ tokenId: 5205, totalViews: 16 }]);

    expect(rowsIn(queryClient)[0].totalViews).toBe(16);
    expect(rowsIn(queryClient, imagesKey)[0].totalViews).toBe(16);
    expect(rowsIn(queryClient, profileKey)[0].totalViews).toBe(16);
  });

  it("matches rows keyed on id as well as tokenId", () => {
    queryClient.setQueryData(KEY, feed([{ id: "77", totalViews: 1 }]));
    mergeLiveCounts(queryClient, [{ tokenId: 77, totalViews: 5 }]);
    expect(rowsIn(queryClient)[0].totalViews).toBe(5);
  });

  it("does not pass a count patch off as a refetch", () => {
    queryClient.setQueryData(KEY, feed([{ tokenId: 1, totalViews: 1 }]));
    const query = queryClient.getQueryCache().findAll({ queryKey: ["home-feed"] })[0];
    query.setState({ ...query.state, dataUpdatedAt: 0 });

    mergeLiveCounts(queryClient, [{ tokenId: 1, totalViews: 2 }]);

    // Still stale: the list itself was never revalidated, only its numbers.
    expect(query.state.dataUpdatedAt).toBe(0);
  });

  it("ignores rows with no usable id and pages with no result array", () => {
    queryClient.setQueryData(KEY, { pages: [{ pagination: {} }], pageParams: [1] });
    expect(() => mergeLiveCounts(queryClient, [{ totalViews: 1 }])).not.toThrow();
    expect(() => mergeLiveCounts(queryClient, [])).not.toThrow();
  });
});
