// The NativeWind babel plugin rewrites createElement to its interop; give it
// plain React so the render works without a native appearance listener.
jest.mock("react-native-css-interop", () => ({ createInteropElement: jest.requireActual("react").createElement }));

import { createElement, Fragment } from "react";
import renderer, { act } from "react-test-renderer";
import { useKeyedState } from "../../hooks/useItemState";

// A .ts file on purpose, like useItemState.test: the hook is pure React, so
// createElement is all the test needs.
type Setter = (next: string | null | ((prev: string | null) => string | null)) => void;
const setters: Record<string, Setter> = {};
const painted: string[] = [];

function Cell({ id }: { id: string }) {
  const [value, set] = useKeyedState<string | null>(id, null);
  setters[id] = set;
  const text = `${id}:${value ?? "-"}`;
  painted.push(text);
  return createElement(Fragment, null, text);
}

function mount(id: string) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(createElement(Cell, { id }));
  });
  return tree;
}

describe("useKeyedState", () => {
  beforeEach(() => {
    painted.length = 0;
    for (const k of Object.keys(setters)) delete setters[k];
  });

  it("keeps a write under the key it was made with", () => {
    const tree = mount("a");
    act(() => setters.a("open"));
    expect(tree.toJSON()).toBe("a:open");
    act(() => setters.a((prev) => `${prev}!`));
    expect(tree.toJSON()).toBe("a:open!");
  });

  it("never shows a write made under key A while the card shows key B", () => {
    const tree = mount("a");
    act(() => setters.a("open"));
    act(() => tree.update(createElement(Cell, { id: "b" })));
    expect(tree.toJSON()).toBe("b:-");
    // Not even for one render: the card handed post B never paints A's value.
    expect(painted.filter((p) => p.startsWith("b:"))).toEqual(["b:-"]);
  });

  it("drops a late write for A that lands after the card moved on to B", () => {
    const tree = mount("a");
    // What a save handler captured at tap time, before the card was reused.
    const lateSetterForA = setters.a;
    act(() => tree.update(createElement(Cell, { id: "b" })));
    act(() => lateSetterForA("open"));
    expect(tree.toJSON()).toBe("b:-");
    // B's own writes still work afterwards.
    act(() => setters.b("mine"));
    expect(tree.toJSON()).toBe("b:mine");
  });

  it("keeps B's value through a late write for A, and never shows that write when the card gets A back", () => {
    const tree = mount("a");
    const lateSetterForA = setters.a;
    act(() => tree.update(createElement(Cell, { id: "b" })));
    act(() => setters.b("mine"));
    act(() => lateSetterForA("open"));
    expect(tree.toJSON()).toBe("b:mine");
    act(() => tree.update(createElement(Cell, { id: "a" })));
    expect(tree.toJSON()).toBe("a:-");
  });

  it("reads the fallback again for a key it has never been written under", () => {
    const tree = mount("a");
    act(() => setters.a("open"));
    act(() => tree.update(createElement(Cell, { id: "b" })));
    act(() => setters.b("mine"));
    act(() => tree.update(createElement(Cell, { id: "c" })));
    expect(tree.toJSON()).toBe("c:-");
  });
});
