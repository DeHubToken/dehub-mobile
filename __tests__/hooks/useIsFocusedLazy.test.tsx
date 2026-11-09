import React from "react";
import { act, create } from "react-test-renderer";
import { NavigationContext } from "@react-navigation/native";
import { useIsFocusedLazy } from "../../hooks/useIsFocusedLazy";

jest.mock("dehub-jsx/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));

function fakeNavigation() {
  let focused = true;
  const listeners: Record<string, Set<() => void>> = { focus: new Set(), blur: new Set() };
  return {
    setFocused(next: boolean) {
      focused = next;
      listeners[next ? "focus" : "blur"].forEach((fn) => fn());
    },
    isFocused: () => focused,
    addListener: (type: "focus" | "blur", fn: () => void) => {
      listeners[type].add(fn);
      return () => listeners[type].delete(fn);
    },
  };
}

it("follows focus and blur without reading the navigator's focus context", () => {
  const navigation = fakeNavigation();
  const seen: boolean[] = [];
  function Probe() {
    seen.push(useIsFocusedLazy());
    return null;
  }
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<NavigationContext.Provider value={navigation as any}><Probe /></NavigationContext.Provider>);
  });
  expect(seen[seen.length - 1]).toBe(true);
  act(() => navigation.setFocused(false));
  expect(seen[seen.length - 1]).toBe(false);
  act(() => navigation.setFocused(true));
  expect(seen[seen.length - 1]).toBe(true);
  act(() => tree.unmount());
});

it("reports focused outside a navigator", () => {
  let value: boolean | undefined;
  function Probe() {
    value = useIsFocusedLazy();
    return null;
  }
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<Probe />); });
  expect(value).toBe(true);
  act(() => tree.unmount());
});
