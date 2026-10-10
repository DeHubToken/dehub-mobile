import { appendStockResults, createStockSearchSession } from "../../libs/editor/stockBrowser";

describe("stock browser requests", () => {
  it("appends providers without duplicate files or repeated identifiers", () => {
    const a = { id: "one", downloadUrl: "https://media/a" };
    const b = { id: "two", downloadUrl: "https://media/b" };
    expect(appendStockResults([a], [{ ...a, id: "other" }, { ...b, id: "one" }, b, { id: "empty", downloadUrl: "" }])).toEqual([a, b]);
  });
  it("retains page order across repeated provider pages", () => {
    const a = { downloadUrl: "a" }, b = { downloadUrl: "b" }, c = { downloadUrl: "c" };
    expect(appendStockResults([a, b], [b, c, a])).toEqual([a, b, c]);
  });
  it("aborts an older search and rejects its late response after a filter change", () => {
    const session = createStockSearchSession(), old = session.begin(), next = session.begin();
    expect(old.signal.aborted).toBe(true); expect(old.current()).toBe(false);
    expect(next.signal.aborted).toBe(false); expect(next.current()).toBe(true);
  });
  it("rejects late results after the browser closes", () => {
    const session = createStockSearchSession(), ticket = session.begin();
    session.cancel(); expect(ticket.current()).toBe(false); expect(ticket.signal.aborted).toBe(true);
  });
});
