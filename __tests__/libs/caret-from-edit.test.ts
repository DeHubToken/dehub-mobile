import { caretFromEdit } from "../../libs/caret-from-edit";

describe("caretFromEdit", () => {
  it("uses the selection from before the edit", () => {
    expect(caretFromEdit("buy $DH", "buy $DHB", { start: 7, end: 7 })).toBe(8);
  });

  it("uses a selection that already moved", () => {
    expect(caretFromEdit("buy $DH", "buy $DHB", { start: 8, end: 8 })).toBe(8);
  });

  it("puts the caret after typing over a selected range", () => {
    expect(caretFromEdit("hi $DHB and $ETH now", "x", { start: 0, end: 20 })).toBe(1);
    expect(caretFromEdit("a $DHB b", "a Q b", { start: 2, end: 6 })).toBe(3);
  });

  it("falls back to the end of the edit when the selection is stale", () => {
    expect(caretFromEdit("hello world", "hello brave world", { start: 0, end: 0 })).toBe(12);
  });
});
