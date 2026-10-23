import { selectAuthorThreadIds } from "../../libs/author-thread";

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

  it("stops at the first comment by someone else", () => {
    const ids = selectAuthorThreadIds([row(1, "0xbbbb", 1), row(2, A, 2)], A);
    expect(ids.size).toBe(0);
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
