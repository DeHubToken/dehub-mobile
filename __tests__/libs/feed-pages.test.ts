import { flattenFeedPages } from "../../libs/feed-pages";

const none = () => false;

describe("flattenFeedPages", () => {
  it("renders a post once when two pages both return it", () => {
    // Exactly the shape prod produces: /feed pages by offset, so a post
    // published mid-scroll pushes the boundary and page 2 repeats page 1's
    // last row.
    const pages = [
      { result: [{ tokenId: 1 }, { tokenId: 2 }, { tokenId: 3 }] },
      { result: [{ tokenId: 3 }, { tokenId: 4 }] },
    ];

    const out = flattenFeedPages<any>(pages, none);

    expect(out.map((p) => p.tokenId)).toEqual([1, 2, 3, 4]);
  });

  it("keeps the first copy, so the row does not jump pages", () => {
    const pages = [
      { result: [{ tokenId: 7, title: "first" }] },
      { result: [{ tokenId: 7, title: "second" }] },
    ];

    const out = flattenFeedPages<any>(pages, none);

    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("first");
    expect(out[0].__listKey).toContain("-p0-i0");
  });

  it("drops deleted posts", () => {
    const pages = [{ result: [{ tokenId: 1 }, { tokenId: 2 }] }];

    const out = flattenFeedPages<any>(pages, (id) => id === 2);

    expect(out.map((p) => p.tokenId)).toEqual([1]);
  });

  it("does not collapse rows that have no id of their own", () => {
    // Carousel inserts and ads ride the same list without a tokenId; they must
    // not all fold into one row.
    const pages = [{ result: [{ kind: "ad" }, { kind: "ad" }] }];

    expect(flattenFeedPages<any>(pages, none)).toHaveLength(2);
  });

  it("survives a page with no result", () => {
    expect(flattenFeedPages<any>([{ result: null }, {}], none)).toEqual([]);
  });

  it("falls back to id and nftId when tokenId is absent", () => {
    const pages = [{ result: [{ id: 5 }, { id: 5 }, { nftId: 9 }] }];

    const out = flattenFeedPages<any>(pages, none);

    expect(out).toHaveLength(2);
  });
});
