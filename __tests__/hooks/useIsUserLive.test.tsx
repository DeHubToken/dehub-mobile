import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
jest.mock("react-native-css-interop", () => ({ createInteropElement: require("react")["createElement"] }));
const mockGetLiveVideos = jest.fn();
jest.mock("../../services/live.service", () => ({ getLiveVideos: (...args: unknown[]) => mockGetLiveVideos(...args) }));
import { setLiveStageHosts, useIsUserLive, useLiveTarget } from "../../hooks/useIsUserLive";

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  setLiveStageHosts([]);
});
afterEach(() => client.clear());

it("marks streamers on air by address or username, and nobody else", async () => {
  mockGetLiveVideos.mockResolvedValue([
    { address: "0xAAA", status: "LIVE", account: { username: "Alice" } },
    { address: "0xBBB", status: "OFFLINE", isActive: false },
    { address: "0xCCC", status: "ENDED" },
  ]);
  const { result, unmount } = renderHook(() => [
    useIsUserLive("0xaaa"),
    useIsUserLive(undefined, "alice"),
    useIsUserLive("0xbbb"),
    useIsUserLive("0xccc", "carol"),
    useIsUserLive(),
  ], { wrapper });
  await waitFor(() => expect(result.current).toEqual([true, true, false, false, false]));
  // Every avatar shares the one request.
  expect(mockGetLiveVideos).toHaveBeenCalledTimes(1);
  unmount();
});

it("marks hosts of live stages", async () => {
  mockGetLiveVideos.mockResolvedValue([]);
  const { result, unmount } = renderHook(() => useIsUserLive("0xDDD", "dave"), { wrapper });
  expect(result.current).toBe(false);
  act(() => setLiveStageHosts([{ address: "0xddd", username: null }]));
  expect(result.current).toBe(true);
  act(() => setLiveStageHosts([]));
  expect(result.current).toBe(false);
  unmount();
});

it("says where a tap on a live avatar goes: the stream, or the hosted stage", async () => {
  mockGetLiveVideos.mockResolvedValue([{ _id: "s1", tokenId: 42, address: "0xAAA", status: "LIVE" }]);
  const { result, unmount } = renderHook(() => [useLiveTarget("0xaaa"), useLiveTarget("0xeee"), useLiveTarget("0xfff")], { wrapper });
  await waitFor(() => expect(result.current[0]).toEqual({ kind: "stream", streamId: "s1", tokenId: 42 }));
  expect(result.current[1]).toBeNull();
  act(() => setLiveStageHosts([{ address: "0xeee", id: "stage-1" }]));
  expect(result.current[1]).toEqual({ kind: "stage", id: "stage-1" });
  expect(result.current[2]).toBeNull();
  unmount();
});
