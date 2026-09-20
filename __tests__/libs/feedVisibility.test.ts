import { createFeedVisibilityStore } from "../../libs/feedVisibility";

describe("createFeedVisibilityStore", () => {
  it("notifies only the rows whose visibility changed", () => {
    const store = createFeedVisibilityStore();
    const calls: string[] = [];
    store.subscribe("a", () => calls.push("a"));
    store.subscribe("b", () => calls.push("b"));
    store.subscribe("c", () => calls.push("c"));

    store.update(new Set(["a", "b"]), null);
    expect(calls.sort()).toEqual(["a", "b"]);

    calls.length = 0;
    // b stays visible, a leaves, c enters: b must not hear about it.
    store.update(new Set(["b", "c"]), null);
    expect(calls.sort()).toEqual(["a", "c"]);
    expect(store.isVisible("a")).toBe(false);
    expect(store.isVisible("b")).toBe(true);
    expect(store.isVisible("c")).toBe(true);
  });

  it("notifies the row losing and the row gaining the autoplay slot", () => {
    const store = createFeedVisibilityStore();
    const calls: string[] = [];
    store.subscribe("a", () => calls.push("a"));
    store.subscribe("b", () => calls.push("b"));

    store.update(new Set(["a", "b"]), "a");
    calls.length = 0;
    store.update(new Set(["a", "b"]), "b");
    expect(calls.sort()).toEqual(["a", "b"]);
    expect(store.isAutoplay("a")).toBe(false);
    expect(store.isAutoplay("b")).toBe(true);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createFeedVisibilityStore();
    const calls: string[] = [];
    const off = store.subscribe("a", () => calls.push("a"));
    off();
    store.update(new Set(["a"]), null);
    expect(calls).toEqual([]);
  });

  // A tab switch used to reach every mounted cell through renderItem. Now it
  // is one flag, and only the rows that were on screen hear it.
  it("going dark reaches only the rows that were visible or autoplaying", () => {
    const store = createFeedVisibilityStore();
    const calls: string[] = [];
    store.subscribe("a", () => calls.push("a"));
    store.subscribe("b", () => calls.push("b"));
    store.subscribe("c", () => calls.push("c"));
    store.update(new Set(["a", "b"]), "a");
    calls.length = 0;

    store.setLive(false);
    expect(calls.sort()).toEqual(["a", "b"]);
    expect(store.isVisible("a")).toBe(false);
    expect(store.isAutoplay("a")).toBe(false);
    expect(store.isVisible("b")).toBe(false);

    calls.length = 0;
    // Same value again is a no-op.
    store.setLive(false);
    expect(calls).toEqual([]);

    // Coming back restores the same rows without a new tick.
    store.setLive(true);
    expect(calls.sort()).toEqual(["a", "b"]);
    expect(store.isVisible("a")).toBe(true);
    expect(store.isAutoplay("a")).toBe(true);
    expect(store.isVisible("c")).toBe(false);
  });

  it("keeps a tick's bookkeeping while dark and applies it on return", () => {
    const store = createFeedVisibilityStore(false);
    const calls: string[] = [];
    store.subscribe("a", () => calls.push("a"));
    store.subscribe("b", () => calls.push("b"));

    store.update(new Set(["a"]), "a");
    // Dark: nobody's answer moved, so nobody is told.
    expect(calls).toEqual([]);
    expect(store.isVisible("a")).toBe(false);

    store.setLive(true);
    expect(calls).toEqual(["a"]);
    expect(store.isVisible("a")).toBe(true);
    expect(store.isAutoplay("a")).toBe(true);
    expect(store.isVisible("b")).toBe(false);
  });
});
