import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
jest.mock("react-native-css-interop", () => ({ createInteropElement: require("react")["createElement"] }));
const mockGetNFT = jest.fn();
jest.mock("../../services/nft.service", () => ({ getNFT: (...args: unknown[]) => mockGetNFT(...args) }));
import { markVideoProcessing, useVideoProcessingStatus, type VideoProcessingStatus } from "../../hooks/useVideoProcessingStatus";

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => { client.clear(); jest.useRealTimers(); });

it("clears a stale loader from the server and shares completion across copies", async () => {
  mockGetNFT.mockResolvedValue({ result: { tokenId: 6475, transcodingStatus: "done" } });
  const { result, unmount } = renderHook(() => [
    useVideoProcessingStatus(6475, "on", true),
    useVideoProcessingStatus(6475, "pending", true),
  ], { wrapper });
  await waitFor(() => expect(result.current).toEqual(["done", "done"]));
  expect(mockGetNFT).toHaveBeenCalledTimes(1);
  jest.useFakeTimers();
  act(() => jest.advanceTimersByTime(20_000));
  expect(mockGetNFT).toHaveBeenCalledTimes(1);
  unmount();
});

it("follows pending work until failure and restarts after an accepted retry", async () => {
  mockGetNFT.mockResolvedValueOnce({ result: { transcodingStatus: "on" } })
    .mockResolvedValueOnce({ result: { transcodingStatus: "failed" } })
    .mockResolvedValue({ result: { transcodingStatus: "done" } });
  const { result, unmount } = renderHook(() => useVideoProcessingStatus(39, "pending", true), { wrapper });
  await waitFor(() => expect(result.current).toBe("on"));
  await waitFor(() => expect(result.current).toBe("failed"), { timeout: 7_000 });
  act(() => markVideoProcessing(client, 39));
  await waitFor(() => expect(result.current).toBe("done"), { timeout: 7_000 });
  expect(mockGetNFT).toHaveBeenCalledTimes(3);
  unmount();
}, 20_000);

it("does not fetch hidden, completed, legacy or backgrounded videos", () => {
  Object.defineProperty(AppState, "currentState", { value: "background", configurable: true });
  const { unmount } = renderHook(() => [
    useVideoProcessingStatus(1, "pending", true),
    useVideoProcessingStatus(2, "on", false),
    useVideoProcessingStatus(3, "done", true),
    useVideoProcessingStatus(4, undefined, true),
  ], { wrapper });
  expect(mockGetNFT).not.toHaveBeenCalled();
  unmount();
});

it("does not carry a late completion onto a recycled card or clear a missing status", async () => {
  let finish!: (value: unknown) => void;
  mockGetNFT.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue({ result: {} });
  const { result, rerender, unmount } = renderHook(
    ({ id, status }: { id: number; status: VideoProcessingStatus }) => useVideoProcessingStatus(id, status, true),
    { wrapper, initialProps: { id: 1, status: "pending" as VideoProcessingStatus } },
  );
  rerender({ id: 2, status: "pending" });
  await act(async () => finish({ result: { transcodingStatus: "done" } }));
  await waitFor(() => expect(mockGetNFT).toHaveBeenCalledTimes(2));
  expect(result.current).toBe("pending");
  unmount();
});
