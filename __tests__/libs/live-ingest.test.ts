import {
  liveProviderOf,
  hlsUrlFor,
  whipEndpointFor,
  probeIngestReachable,
} from "../../libs/live-ingest";

/**
 * The provider is read off the STREAM, never off the build — a stream that
 * predates the field is Livepeer by definition. The web app mirrors this
 * module in src/lib/live-ingest.ts; the two must resolve the same streams
 * to the same URLs.
 */
describe("liveProviderOf", () => {
  it("defaults to livepeer when the stream carries no provider", () => {
    expect(liveProviderOf(null)).toBe("livepeer");
    expect(liveProviderOf({})).toBe("livepeer");
    expect(liveProviderOf({ provider: "" })).toBe("livepeer");
  });

  it("resolves mediamtx only on the exact marker", () => {
    expect(liveProviderOf({ provider: "mediamtx" })).toBe("mediamtx");
    expect(liveProviderOf({ provider: "MediaMTX" })).toBe("livepeer");
  });
});

describe("hlsUrlFor", () => {
  it("returns null without a playbackId", () => {
    expect(hlsUrlFor(null)).toBeNull();
    expect(hlsUrlFor({ provider: "mediamtx" })).toBeNull();
  });

  it("builds the Livepeer CDN ladder by default", () => {
    expect(hlsUrlFor({ playbackId: "abc123" })).toBe(
      "https://livepeercdn.studio/hls/abc123/index.m3u8"
    );
  });

  it("builds the self-hosted ladder for mediamtx streams", () => {
    expect(hlsUrlFor({ provider: "mediamtx", playbackId: "abc123" })).toBe(
      "https://live.dehub.io/abc123/index.m3u8"
    );
  });
});

describe("whipEndpointFor", () => {
  it("returns null for Livepeer streams (caller uses its own default)", () => {
    expect(whipEndpointFor({ playbackId: "abc", streamKey: "key" })).toBeNull();
  });

  it("returns null for a mediamtx stream missing its playbackId", () => {
    expect(whipEndpointFor({ provider: "mediamtx", streamKey: "key" })).toBeNull();
  });

  it("names the broadcast by playbackId and carries the key as a credential", () => {
    expect(
      whipEndpointFor({ provider: "mediamtx", playbackId: "abc", streamKey: "s3cret" })
    ).toEqual({
      url: "https://live.dehub.io/abc/whip",
      token: "dehub:s3cret",
    });
  });
});

/**
 * Any HTTP response proves the network path — the ingest's root answers with
 * an error status, and that is still proof. Only a network failure or the
 * probe's own timeout means the host is unreachable.
 */
describe("probeIngestReachable", () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it("is reachable on any response, error status included", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(probeIngestReachable()).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://live.dehub.io/",
      expect.objectContaining({ method: "GET", cache: "no-store" })
    );
  });

  it("is unreachable on a network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed"));
    await expect(probeIngestReachable()).resolves.toBe(false);
  });

  it("gives up after its own timeout instead of hanging", async () => {
    jest.useFakeTimers();
    // A fetch that only settles when its abort signal fires — the shape of a
    // null-routed host, where packets vanish and nothing ever answers.
    global.fetch = jest.fn(
      (_url: any, init: any) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new Error("Aborted"))
          );
        })
    ) as any;
    const probe = probeIngestReachable(4000);
    jest.advanceTimersByTime(4001);
    await expect(probe).resolves.toBe(false);
  });
});
