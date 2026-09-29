// The NativeWind babel plugin rewrites createElement to its interop; give it
// plain React so the render works without a native appearance listener.
jest.mock("react-native-css-interop", () => ({ createInteropElement: jest.requireActual("react").createElement }));

import { createElement, Fragment } from "react";
import renderer, { act } from "react-test-renderer";
import { clearUnlockedTokens, markTokenUnlocked, useTokenUnlocked } from "../../libs/unlocked-tokens";

// A .ts file on purpose, like useItemState.test: the hook is pure React, so
// createElement is all the test needs.
function Card({ id }: { id: number }) {
  const unlocked = useTokenUnlocked(id);
  return createElement(Fragment, null, `${id}:${unlocked ? "open" : "locked"}`);
}

function mount(id: number) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(createElement(Card, { id }));
  });
  return tree;
}

describe("useTokenUnlocked", () => {
  beforeEach(() => clearUnlockedTokens());

  it("re-renders a mounted card when its post is unlocked", () => {
    const tree = mount(7);
    expect(tree.toJSON()).toBe("7:locked");
    act(() => markTokenUnlocked(7));
    expect(tree.toJSON()).toBe("7:open");
  });

  it("leaves other posts locked", () => {
    const seven = mount(7);
    const eight = mount(8);
    act(() => markTokenUnlocked("7"));
    expect(seven.toJSON()).toBe("7:open");
    expect(eight.toJSON()).toBe("8:locked");
  });

  it("reads the new post's answer when a card is handed another post", () => {
    act(() => markTokenUnlocked(7));
    const tree = mount(7);
    expect(tree.toJSON()).toBe("7:open");
    act(() => tree.update(createElement(Card, { id: 9 })));
    expect(tree.toJSON()).toBe("9:locked");
  });

  it("locks again on sign-out", () => {
    const tree = mount(7);
    act(() => markTokenUnlocked(7));
    act(() => clearUnlockedTokens());
    expect(tree.toJSON()).toBe("7:locked");
  });
});
