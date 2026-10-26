import { authorThreadFirst, selectAuthorThreadIds } from "../../libs/author-thread";

const A = "0xAAAA";
const row = (id: number, address: string, minute: number, extra: Record<string, unknown> = {}) => ({
  id,
  address,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
  ...extra,
});

describe("selectAuthorThreadIds", () => {
  it("takes the author's opening comments in time order", () => {
    const ids = selectAuthorThreadIds([row(3, "0xbbbb", 3), row(2, A, 2), row(1, A, 1)], A);
    expect([...ids]).toEqual(["1", "2"]);
  });

  it("keeps the author's comments posted after someone else spoke", () => {
    const ids = selectAuthorThreadIds([row(1, "0xbbbb", 1), row(2, A, 2)], A);
    expect([...ids]).toEqual(["2"]);
  });

  it("skips the author's replies", () => {
    const ids = selectAuthorThreadIds([row(1, A, 1), row(2, "0xbbbb", 2), row(3, A, 3, { parentId: 2 }), row(4, A, 4)], A);
    expect([...ids]).toEqual(["1", "4"]);
  });

  it("leaves out a comment somebody replied to", () => {
    const ids = selectAuthorThreadIds([row(1, A, 1), row(2, A, 2), row(3, "0xbbbb", 3, { parentId: 2 })], A);
    expect([...ids]).toEqual(["1"]);
  });

  it("reads the address from the user object", () => {
    const ids = selectAuthorThreadIds([{ id: 1, user: { address: A }, createdAt: "2026-01-01T00:00:00Z" }], A.toLowerCase());
    expect([...ids]).toEqual(["1"]);
  });

  it("needs an author", () => {
    expect(selectAuthorThreadIds([row(1, A, 1)], undefined).size).toBe(0);
  });
});

describe("authorThreadFirst", () => {
  it("puts the author's straight comments first, oldest first, keeping the rest in order", () => {
    const roots = [row(5, "0xbbbb", 5), row(4, A, 4), row(3, "0xcccc", 3), row(2, A, 2)];
    expect(authorThreadFirst(roots, A).map((r) => r.id)).toEqual([2, 4, 5, 3]);
  });
});
