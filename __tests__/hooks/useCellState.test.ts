// The NativeWind babel plugin rewrites createElement to its interop; give it
// plain React so the render works without a native appearance listener.
jest.mock("react-native-css-interop", () => ({ createInteropElement: jest.requireActual("react").createElement }));

import { createElement, Fragment } from "react";
import renderer, { act } from "react-test-renderer";
import { RecyclerViewContextProvider } from "@shopify/flash-list/dist/recyclerview/RecyclerViewContextProvider";
import { useCellState, useRecyclingState } from "../../hooks/useCellState";

// A .ts file on purpose, like useItemState.test: the hooks are pure React, so
// createElement is all the test needs.
let bump: (() => void) | null = null;
const painted: string[] = [];

function Cell({ id }: { id: string }) {
  const [n, setN] = useCellState(0, [id]);
  bump = () => setN((v) => v + 1);
  const text = `${id}:${n}`;
  painted.push(text);
  return createElement(Fragment, null, text);
}

function LayoutCell({ id }: { id: string }) {
  const [n, setN] = useRecyclingState(0, [id]);
  bump = () => setN((v) => v + 1);
  return createElement(Fragment, null, `${id}:${n}`);
}

function inList(child: ReturnType<typeof createElement>, layout: jest.Mock) {
  return createElement(RecyclerViewContextProvider, { value: { layout } as any }, child);
}

describe("useCellState", () => {
  beforeEach(() => {
    bump = null;
    painted.length = 0;
  });

  it("keeps state while the deps are stable and resets when they change", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(createElement(Cell, { id: "a" }));
    });
    act(() => bump!());
    expect(tree.toJSON()).toBe("a:1");
    act(() => tree.update(createElement(Cell, { id: "a" })));
    expect(tree.toJSON()).toBe("a:1");
    act(() => tree.update(createElement(Cell, { id: "b" })));
    expect(tree.toJSON()).toBe("b:0");
    // Reset in the same render: the card handed post b never paints a's count.
    expect(painted.filter((p) => p.startsWith("b:"))).toEqual(["b:0"]);
    act(() => bump!());
    expect(tree.toJSON()).toBe("b:1");
  });

  it("works as plain state outside a recycling list", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(createElement(Cell, { id: "a" }));
    });
    act(() => bump!());
    act(() => bump!());
    expect(tree.toJSON()).toBe("a:2");
  });

  it("never asks the list to relayout, unlike useRecyclingState's own setter", () => {
    const layout = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(inList(createElement(Cell, { id: "a" }), layout));
    });
    act(() => bump!());
    expect(tree.toJSON()).toBe("a:1");
    expect(layout).not.toHaveBeenCalled();

    act(() => tree.update(inList(createElement(LayoutCell, { id: "a" }), layout)));
    act(() => bump!());
    expect(layout).toHaveBeenCalledTimes(1);
  });
});
