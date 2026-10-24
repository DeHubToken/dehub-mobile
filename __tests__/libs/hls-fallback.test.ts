// The NativeWind babel plugin rewrites createElement to its interop; give it
// plain React so the render works without a native appearance listener.
jest.mock("react-native-css-interop", () => ({ createInteropElement: jest.requireActual("react").createElement }));

import { createElement, Fragment } from "react";
import renderer, { act } from "react-test-renderer";
import { hasHlsFailed, isHlsUrl, markHlsFailed, useHlsFallback } from "../../libs/hls-fallback";

describe("hls fallback", () => {
  it("only ever retires HLS manifests, and each one once", () => {
    expect(isHlsUrl("https://cdn/videos/1/hls/a/master.m3u8")).toBe(true);
    expect(isHlsUrl("https://cdn/videos/1/hls/a/master.m3u8?sig=x")).toBe(true);
    expect(isHlsUrl("https://cdn/videos/1.mp4")).toBe(false);
    expect(isHlsUrl(undefined)).toBe(false);

    // A failed MP4 has nothing to fall back to, so it is never recorded.
    expect(markHlsFailed("https://cdn/videos/1.mp4")).toBe(false);
    expect(hasHlsFailed("https://cdn/videos/1.mp4")).toBe(false);
    expect(markHlsFailed(null)).toBe(false);

    expect(markHlsFailed("https://cdn/videos/1/hls/a/master.m3u8")).toBe(true);
    expect(hasHlsFailed("https://cdn/videos/1/hls/a/master.m3u8")).toBe(true);
    expect(markHlsFailed("https://cdn/videos/1/hls/a/master.m3u8")).toBe(false);
  });

  it("moves a reader onto the MP4 when its ladder fails, and leaves other posts alone", () => {
    const ladder = "https://cdn/videos/2/hls/b/master.m3u8";
    const other = "https://cdn/videos/3/hls/c/master.m3u8";
    const seen: string[] = [];
    const otherSeen: string[] = [];
    function Player({ hls, mp4, log }: { hls: string; mp4: string; log: string[] }) {
      const source = useHlsFallback(() => (hasHlsFailed(hls) ? mp4 : hls));
      log.push(source);
      return createElement(Fragment, null, source);
    }

    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(createElement(Fragment, null,
        createElement(Player, { hls: ladder, mp4: "https://cdn/videos/2.mp4", log: seen }),
        createElement(Player, { hls: other, mp4: "https://cdn/videos/3.mp4", log: otherSeen }),
      ));
    });
    expect(seen).toEqual([ladder]);

    act(() => {
      markHlsFailed(ladder);
    });
    expect(seen).toEqual([ladder, "https://cdn/videos/2.mp4"]);
    // The other post's answer did not change, so it did not re-render.
    expect(otherSeen).toEqual([other]);

    act(() => tree.unmount());
  });
});
