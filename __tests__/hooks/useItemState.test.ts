// The NativeWind babel plugin rewrites createElement to its interop; give it
// plain React so the render works without a native appearance listener.
jest.mock("react-native-css-interop", () => ({ createInteropElement: jest.requireActual("react").createElement }));

import { createElement, Fragment } from "react";
import renderer, { act } from "react-test-renderer";
import { useItemState } from "../../hooks/useItemState";

// A .ts file on purpose: a .tsx test goes through the NativeWind JSX runtime,
// whose appearance listener cannot start in this environment. The hook is
// pure React, so createElement is all the test needs.
let bump: (() => void) | null = null;

function Cell({ id, initial }: { id: string; initial: number }) {
  const [n, setN] = useItemState(initial, id);
  bump = () => setN((v) => v + 1);
  return createElement(Fragment, null, `${id}:${n}`);
}

describe("useItemState", () => {
  it("keeps state while the key is stable and resets when it changes", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(createElement(Cell, { id: "a", initial: 0 }));
    });
    act(() => bump!());
    expect(tree.toJSON()).toBe("a:1");
    act(() => tree.update(createElement(Cell, { id: "a", initial: 0 })));
    expect(tree.toJSON()).toBe("a:1");
    act(() => tree.update(createElement(Cell, { id: "b", initial: 5 })));
    expect(tree.toJSON()).toBe("b:5");
    act(() => bump!());
    expect(tree.toJSON()).toBe("b:6");
  });
});
