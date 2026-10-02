import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
jest.mock("react-native-css-interop", () => ({ createInteropElement: require("react")["createElement"] }));
const mockGetHistory = jest.fn();
let mockSignedIn = true;
let mockAddress = "alice";
jest.mock("../../services/user.service", () => ({ getWatchHistory: (...args: unknown[]) => mockGetHistory(...args) }));
jest.mock("../../hooks/useAppPrefs", () => ({ useAppPrefs: () => ({ hideWatched: false }) }));
jest.mock("../../context/AuthContext", () => ({
  useAuthState: () => ({ isSignedIn: mockSignedIn }),
  useUser: () => ({ address: mockAddress }),
}));
import { useIsWatchedVideo } from "../../hooks/useWatchedVideos";

it("shares history across cards without carrying markers to another account or sign-out", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  mockGetHistory.mockResolvedValueOnce({ result: [{ tokenId: 39 }] }).mockResolvedValueOnce({ result: [] });
  const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
  const { result, rerender, unmount } = renderHook(() => [useIsWatchedVideo(39), useIsWatchedVideo(40)], { wrapper });
  await waitFor(() => expect(result.current).toEqual([true, false]));
  expect(mockGetHistory).toHaveBeenCalledTimes(1);
  mockAddress = "bob";
  rerender({});
  expect(result.current).toEqual([false, false]);
  await waitFor(() => expect(mockGetHistory).toHaveBeenCalledTimes(2));
  mockSignedIn = false;
  rerender({});
  expect(result.current).toEqual([false, false]);
  unmount();
  client.clear();
});

import { watchedLabel } from "../../i18n/watched-label";
it("resolves translated regional labels and falls back for unavailable locales", () => {
  expect(watchedLabel("en-GB")).toBe(", including you");
  expect(watchedLabel("es-MX")).toBe(watchedLabel("es"));
  expect(watchedLabel("es")).not.toBe(watchedLabel("en"));
  expect(watchedLabel("unknown")).toBe(watchedLabel("en"));
});
