import { applyNavOrder, mergeNavOrder, navOrderId, sanitiseNavOrder } from "../../libs/navOrder";

jest.mock("../../libs/feed-interests", () => ({ saveAccountPrefs: jest.fn(() => Promise.resolve()) }));

const id = (s: string) => s;

describe("nav order", () => {
  it("keeps the default order when nothing is saved", () => {
    expect(applyNavOrder(["a", "b", "c"], [], id)).toEqual(["a", "b", "c"]);
  });
  it("applies a saved order and slots new items after their default neighbour", () => {
    expect(applyNavOrder(["a", "b", "new", "c"], ["c", "a", "b"], id)).toEqual(["c", "a", "b", "new"]);
  });
  it("keeps hidden and web-only ids in place when saving", () => {
    expect(mergeNavOrder(["a", "x", "b", "c"], ["c", "a", "b"])).toEqual(["c", "a", "x", "b"]);
  });
  it("sanitises junk from the account blob", () => {
    expect(sanitiseNavOrder(["a", "a", 3, "", null, "b"])).toEqual(["a", "b"]);
  });
  it("shares ids with web where the label keys differ", () => {
    expect(navOrderId("nav.stages")).toBe("stages.title");
    expect(navOrderId("nav.home")).toBe("nav.home");
  });
});
