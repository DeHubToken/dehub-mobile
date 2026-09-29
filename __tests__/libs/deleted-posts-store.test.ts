// The NativeWind babel plugin rewrites createElement to its interop; give it
// plain React so the render works without a native appearance listener.
jest.mock("react-native-css-interop", () => ({ createInteropElement: jest.requireActual("react").createElement }));

import { createElement, Fragment } from "react";
import renderer, { act } from "react-test-renderer";
import { isPostDeletedSync, markPostDeleted, useDeletedPostsVersion } from "../../libs/deleted-posts-store";

describe("deleted posts store", () => {
  it("re-renders a list that reads it when a post is deleted, so the row leaves at once", async () => {
    // The home feed recycles cells, so a card that only hides itself loses
    // that when its cell is handed another post, and the deleted post comes
    // back further down. The list has to drop the row itself.
    const seen: number[] = [];
    function List() {
      const version = useDeletedPostsVersion();
      seen.push(version);
      return createElement(Fragment, null, String(version));
    }

    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(createElement(List));
    });
    expect(isPostDeletedSync(42)).toBe(false);

    await act(async () => {
      await markPostDeleted(42);
    });
    expect(isPostDeletedSync(42)).toBe(true);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBeGreaterThan(seen[0]);

    // The same post again changes nothing a list reads.
    await act(async () => {
      await markPostDeleted("42");
    });
    expect(seen).toHaveLength(2);

    act(() => tree.unmount());
  });
});
