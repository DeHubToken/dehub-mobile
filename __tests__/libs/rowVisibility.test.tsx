import React from "react";
import { act, create } from "react-test-renderer";
import { createFeedVisibilityStore, useRowVisibility, type FeedVisibilityStore } from "../../libs/feedVisibility";

jest.mock("dehub-jsx/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));

const seen: Array<{ key: string; isVisible: boolean; isAutoplay: boolean }> = [];

function Row({ store, rowKey }: { store: FeedVisibilityStore; rowKey: string }) {
  const answer = useRowVisibility(store, rowKey);
  seen.push({ key: rowKey, ...answer });
  return null;
}

const last = () => seen[seen.length - 1];

beforeEach(() => {
  seen.length = 0;
});

it("follows the store for its own key", () => {
  const store = createFeedVisibilityStore(true);
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<Row store={store} rowKey="a" />); });
  expect(last()).toEqual({ key: "a", isVisible: false, isAutoplay: false });

  act(() => store.update(new Set(["a"]), "a"));
  expect(last()).toEqual({ key: "a", isVisible: true, isAutoplay: true });

  act(() => store.setLive(false));
  expect(last()).toEqual({ key: "a", isVisible: false, isAutoplay: false });

  act(() => store.setLive(true));
  expect(last()).toEqual({ key: "a", isVisible: true, isAutoplay: true });
  act(() => tree!.unmount());
});

it("does not re-render for another row's change", () => {
  const store = createFeedVisibilityStore(true);
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<Row store={store} rowKey="a" />); });
  const renders = seen.length;
  act(() => store.update(new Set(["b"]), "b"));
  expect(seen.length).toBe(renders);
  act(() => tree!.unmount());
});

it("a recycled row answers for its new key on its first render", () => {
  const store = createFeedVisibilityStore(true);
  act(() => store.update(new Set(["a"]), "a"));
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<Row store={store} rowKey="a" />); });
  expect(last()).toEqual({ key: "a", isVisible: true, isAutoplay: true });

  act(() => tree!.update(<Row store={store} rowKey="b" />));
  const firstForB = seen.find((entry) => entry.key === "b");
  expect(firstForB).toEqual({ key: "b", isVisible: false, isAutoplay: false });

  act(() => store.update(new Set(["b"]), null));
  expect(last()).toEqual({ key: "b", isVisible: true, isAutoplay: false });
  act(() => tree!.unmount());
});
