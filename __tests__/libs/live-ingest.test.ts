import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  liveProviderOf,
  hlsUrlFor,
  whipEndpointFor,
  edgeWhipEndpointFor,
  probeIngestReachable,
  markIngestUnreachable,
  clearIngestUnreachable,
  hadRecentIngestFailure,
  isNetworkShapedError,
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
 * The relayed signaling path, for phones the direct WHIP never reaches. Same
 * addressing as the direct endpoint — playbackId in the path, key as a
 * credential — but pointed at the Cloudflare-proxied api.dehub.io edge. The
 * web app mirrors this in src/lib/live-ingest.ts.
 */
describe("edgeWhipEndpointFor", () => {
  it("returns null for Livepeer streams (there is nothing to relay)", () => {
    expect(edgeWhipEndpointFor({ playbackId: "abc", streamKey: "key" })).toBeNull();
  });

  it("returns null for a mediamtx stream missing its playbackId", () => {
    expect(edgeWhipEndpointFor({ provider: "mediamtx", streamKey: "key" })).toBeNull();
  });

  it("signs over the api.dehub.io edge and carries the key as a credential", () => {
    expect(
      edgeWhipEndpointFor({ provider: "mediamtx", playbackId: "abc", streamKey: "s3cret" })
    ).toEqual({
      url: "https://api.dehub.io/live-edge/abc/whip",
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

/**
 * A passing probe is one small GET, and the DPI-throttled carriers it exists
 * for pass one intermittently while never carrying the WHIP POST — so the
 * phone's own last direct connect must be able to outvote the probe. The
 * marker's lifecycle (set on a network-shaped direct failure, cleared by a
 * real direct connect, expired on its own) is the contract the mint relies on.
 */
describe("ingest failure memory", () => {
  const KEY = "dehub.ingest.unreachable-at";

  beforeEach(async () => {
    await AsyncStorage.removeItem(KEY);
  });

  it("starts with nothing to report", async () => {
    await expect(hadRecentIngestFailure()).resolves.toBe(false);
  });

  it("remembers a marked failure", async () => {
    await markIngestUnreachable();
    await expect(hadRecentIngestFailure()).resolves.toBe(true);
  });

  it("forgets once a successful direct connect clears it", async () => {
    await markIngestUnreachable();
    await clearIngestUnreachable();
    await expect(hadRecentIngestFailure()).resolves.toBe(false);
  });

  it("expires on its own, so one bad network cannot exile a phone forever", async () => {
    await AsyncStorage.setItem(KEY, String(Date.now() - 25 * 3600 * 1000));
    await expect(hadRecentIngestFailure()).resolves.toBe(false);
  });

  it("treats garbage in the slot as no marker", async () => {
    await AsyncStorage.setItem(KEY, "not-a-timestamp");
    await expect(hadRecentIngestFailure()).resolves.toBe(false);
  });
});

describe("isNetworkShapedError", () => {
  it("recognises the shapes that mean the network ate the request", () => {
    expect(isNetworkShapedError(new TypeError("Network request failed"))).toBe(true);
    expect(isNetworkShapedError({ name: "AbortError" })).toBe(true);
    expect(isNetworkShapedError({ name: "TimeoutError" })).toBe(true);
  });

  it("leaves real server answers and camera errors alone", () => {
    expect(isNetworkShapedError(new Error("WHIP offer failed: 401"))).toBe(false);
    expect(isNetworkShapedError({ name: "NotAllowedError" })).toBe(false);
    expect(isNetworkShapedError(null)).toBe(false);
  });
});

/**
 * The media leg's relay, asked for once and cached for the session. An
 * unconfigured backend answers an empty list and the caller skips the relay
 * entirely; only a network failure resets the cache so the next attempt can
 * retry. The promise lives at module scope, so each test reloads the module
 * for a clean slate. The web app mirrors this in src/lib/live-ingest.ts.
 */
describe("fetchTurnServers", () => {
  const realFetch = global.fetch;
  const ICE = [
    { urls: "stun:stun.dehub.io:3478" },
    {
      urls: ["turn:turn.dehub.io:3478?transport=udp"],
      username: "1699999999:dehub",
      credential: "hmac-blob",
    },
  ];

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("returns the relay servers the API hands back", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ iceServers: ICE }) });
    const { fetchTurnServers } = require("../../libs/live-ingest");
    await expect(fetchTurnServers()).resolves.toEqual(ICE);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.dehub.io/api/live/turn-credentials",
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it("asks once and caches the answer for the session", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ iceServers: ICE }) });
    const { fetchTurnServers } = require("../../libs/live-ingest");
    const first = await fetchTurnServers();
    const second = await fetchTurnServers();
    expect(second).toBe(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("treats an unconfigured backend (no iceServers) as no relay", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const { fetchTurnServers } = require("../../libs/live-ingest");
    await expect(fetchTurnServers()).resolves.toEqual([]);
  });

  it("returns no relay on a non-OK response", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    const { fetchTurnServers } = require("../../libs/live-ingest");
    await expect(fetchTurnServers()).resolves.toEqual([]);
  });

  it("returns no relay on a network error, then retries on the next call", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ iceServers: ICE }) });
    const { fetchTurnServers } = require("../../libs/live-ingest");
    await expect(fetchTurnServers()).resolves.toEqual([]);
    // The failed lookup reset the cache, so the media leg can be retried.
    await expect(fetchTurnServers()).resolves.toEqual(ICE);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
