import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import { VideoDownloadProvider, useVideoDownload } from "../../context/VideoDownloadContext";
import { toastError, toastSuccess } from "../../libs/toast";
import { releaseDownloadMedia } from "../../libs/editor/storage";
import type { VideoDownloadRequest } from "../../libs/editor/downloadProject";

jest.mock("react-native-css-interop/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));
jest.mock("react-native", () => ({
  View: "View", Text: "Text", Modal: "Modal", Pressable: "Pressable", ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("expo-file-system/legacy", () => ({ cacheDirectory: "file://cache/", deleteAsync: jest.fn().mockResolvedValue(undefined), createDownloadResumable: jest.fn() }));
jest.mock("expo-media-library", () => ({ requestPermissionsAsync: jest.fn(), saveToLibraryAsync: jest.fn() }));
jest.mock("../../libs/toast", () => ({ toastError: jest.fn(), toastSuccess: jest.fn() }));
jest.mock("../../libs/editor/storage", () => ({ registerDownloadMedia: jest.fn(() => ({ id: "source-media" })), releaseDownloadMedia: jest.fn() }));
const mockExport = jest.fn(), mockCancel = jest.fn();
jest.mock("../../components/editor/EditorCanvas", () => {
  const R = require("react");
  return { __esModule: true, default: R.forwardRef((props: any, ref: any) => {
    R.useImperativeHandle(ref, () => ({ exportVideo: mockExport, cancelExport: mockCancel }));
    R.useEffect(() => { props.onMediaReady("source-media", { duration: 2, width: 3840, height: 2160 }); }, [props.project.id]);
    return R.createElement("Canvas");
  }) };
});

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((finish, fail) => { resolve = finish; reject = fail; });
  return { promise, resolve, reject };
}
let start!: (request: VideoDownloadRequest) => Promise<void>;
function Handle() { start = useVideoDownload(); return null; }
const request = { url: "file://source.mp4", username: "creator" };
let encoded: ReturnType<typeof deferred<{ uri: string }>>, saved: ReturnType<typeof deferred<void>>;
beforeEach(() => {
  jest.clearAllMocks();
  encoded = deferred<{ uri: string }>(); saved = deferred<void>();
  mockExport.mockReturnValue(encoded.promise);
  mockCancel.mockImplementation(() => encoded.reject(Object.assign(new Error("Cancelled"), { name: "AbortError" })));
  (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
  (MediaLibrary.saveToLibraryAsync as jest.Mock).mockReturnValue(saved.promise);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

async function begin() {
  const screen = render(<VideoDownloadProvider><Handle /></VideoDownloadProvider>);
  let pending!: Promise<void>;
  act(() => { pending = start(request); });
  await waitFor(() => expect(mockExport).toHaveBeenCalledTimes(1));
  return { screen, pending, oldCancel: screen.UNSAFE_getByType("Pressable" as any).props.onPress as () => void };
}

it("stops offering Cancel during the gallery save and closes the job before success notification", async () => {
  const { screen, pending, oldCancel } = await begin();
  expect(mockExport.mock.calls[0][0]).toMatchObject({ width: 3840, height: 2160, bitrate: 8_000_000 });
  await act(async () => { encoded.resolve({ uri: "file://output.mp4" }); });
  await waitFor(() => expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith("file://output.mp4"));
  expect(screen.UNSAFE_queryAllByType("Pressable" as any)).toHaveLength(0);
  expect(screen.UNSAFE_getByType("Modal" as any).props.visible).toBe(true);
  oldCancel();
  expect(mockCancel).not.toHaveBeenCalled();
  (toastSuccess as jest.Mock).mockImplementation(() => oldCancel());
  await act(async () => { saved.resolve(undefined); await pending; });
  expect(toastSuccess).toHaveBeenCalledWith("editor.app.savedToPhotos");
  expect(mockCancel).not.toHaveBeenCalled();
  expect(screen.UNSAFE_getByType("Modal" as any).props.visible).toBe(false);
  expect(releaseDownloadMedia).toHaveBeenCalledWith("source-media");
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith("file://output.mp4", { idempotent: true });
});

it("cancels the active renderer once and removes the action after cancellation", async () => {
  const { screen, pending, oldCancel } = await begin();
  await act(async () => { oldCancel(); await pending; });
  oldCancel();
  expect(mockCancel).toHaveBeenCalledTimes(1);
  expect(screen.UNSAFE_getByType("Modal" as any).props.visible).toBe(false);
  expect(screen.UNSAFE_queryAllByType("Pressable" as any)).toHaveLength(0);
  expect(toastSuccess).not.toHaveBeenCalled(); expect(toastError).not.toHaveBeenCalled();
});

it("closes the job after an encoder failure and ignores a stale Cancel callback", async () => {
  const { screen, pending, oldCancel } = await begin();
  await act(async () => { encoded.reject(new Error("Encoder failed")); await pending; });
  oldCancel();
  expect(mockCancel).not.toHaveBeenCalled();
  expect(toastError).toHaveBeenCalledWith("editor.app.exportFailed");
  expect(screen.UNSAFE_getByType("Modal" as any).props.visible).toBe(false);
  expect(releaseDownloadMedia).toHaveBeenCalledWith("source-media");
});

it("does not notify after the provider unmounts during a non-cancellable gallery save", async () => {
  const { screen, pending } = await begin();
  await act(async () => { encoded.resolve({ uri: "file://output.mp4" }); });
  await waitFor(() => expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalled());
  screen.unmount();
  await act(async () => { saved.resolve(undefined); await pending; });
  expect(toastSuccess).not.toHaveBeenCalled(); expect(toastError).not.toHaveBeenCalled();
  expect(mockCancel).not.toHaveBeenCalled();
  expect(releaseDownloadMedia).toHaveBeenCalledWith("source-media");
});
