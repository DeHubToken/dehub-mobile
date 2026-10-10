import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react-native";
import RecordingPanel from "../../components/editor/RecordingPanel";
import { useProjectHistory } from "../../libs/editor/useProjectHistory";
import type { ProjectSnapshot } from "../../libs/editor/types";
import type { MediaMeta } from "../../libs/editor/storage";
import type { ProjectEditLease } from "../../libs/editor/projectEditGate";

const mockListeners = new Set<(state: string) => void>();
let mockState = "active";
const mockRecorder = { prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(), uri: "file:take.m4a" };
const mockPermission = jest.fn(), mockImport = jest.fn(), mockCamera = jest.fn(), mockConfigure = jest.fn(), mockRelease = jest.fn();
jest.mock("react-native-css-interop/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));
jest.mock("react-native", () => ({ View: "View", Text: "Text", Pressable: "Pressable", StyleSheet: { flatten: (style: unknown) => style }, AppState: {
  get currentState() { return mockState; },
  addEventListener: (_event: string, listener: (state: string) => void) => { mockListeners.add(listener); return { remove: () => mockListeners.delete(listener) }; },
} }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("expo-audio", () => ({ RecordingPresets: { HIGH_QUALITY: {} }, useAudioRecorder: () => mockRecorder }));
jest.mock("expo-image-picker", () => ({ launchCameraAsync: (...args: unknown[]) => mockCamera(...args) }));
jest.mock("../../libs/audioSession", () => ({ configureForRecording: () => mockConfigure(), releaseRecording: () => mockRelease() }));
jest.mock("../../libs/permissions.util", () => ({ runWithPermissions: (...args: unknown[]) => mockPermission(...args) }));
jest.mock("../../libs/editor/storage", () => ({ importClipFile: (...args: unknown[]) => mockImport(...args) }));
jest.mock("../../components/ui/Icon", () => () => null);

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const source: ProjectSnapshot = { id: "same", title: "Source", updatedAt: 1, settings: { width: 640, height: 360, fps: 30, aspectPreset: "16:9", background: "#000" }, tracks: [], clips: [] };
const recorded: MediaMeta = { id: "take", name: "take.m4a", kind: "audio", mimeType: "audio/mp4", width: 0, height: 0, duration: 2, file: "take.m4a", createdAt: 1 };
let history!: ReturnType<typeof useProjectHistory>, added = jest.fn(), time = 1000;
function Harness({ at = 3 }: { at?: number }) {
  const h = useProjectHistory(source); history = h;
  return <RecordingPanel at={at} scope={h.scopeVersion()} onStart={() => h.holdEdits()} onAdd={(media, start) => {
    added(media, start); const current = h.latest()!;
    h.commit({ ...current, tracks: [{ id: "track", kind: media.kind === "audio" ? "audio" : "video", name: media.name, muted: false, hidden: false }], clips: [{ id: "recording", kind: media.kind === "audio" ? "audio" : "video", trackId: "track", start, duration: media.duration ?? 2, trimIn: 0, mediaId: media.id }] });
  }} />;
}
beforeEach(() => {
  jest.resetAllMocks(); mockState = "active"; time = 1000; added = jest.fn();
  jest.spyOn(Date, "now").mockImplementation(() => time);
  mockPermission.mockImplementation(async (_permissions, granted) => { await granted(); });
  mockRecorder.prepareToRecordAsync.mockResolvedValue(undefined); mockRecorder.stop.mockResolvedValue(undefined);
  mockImport.mockResolvedValue(recorded); mockConfigure.mockResolvedValue(undefined); mockRelease.mockResolvedValue(undefined);
  mockCamera.mockResolvedValue({ canceled: true, assets: [] });
});
afterEach(async () => { cleanup(); await act(async () => {}); jest.restoreAllMocks(); });
async function record(view: ReturnType<typeof render>) { await act(async () => fireEvent.press(view.getByText("comments.recordVoice"))); }

it("owns recording through save, uses the original playhead and adds one Undo step", async () => {
  const view = render(<Harness />); await record(view); expect(history.isEditing()).toBe(true);
  expect(() => history.receive(source, "ignored")).toThrow("changed during transfer");
  view.rerender(<Harness at={9} />); time += 2000;
  await act(async () => fireEvent.press(view.getByText("common.save")));
  expect(added).toHaveBeenCalledWith(recorded, 3); expect(history.isEditing()).toBe(false);
  expect(history.latest()!.clips).toHaveLength(1); act(() => history.undo()); expect(history.latest()!.clips).toHaveLength(0);
  act(() => history.redo()); expect(history.latest()!.clips).toHaveLength(1); expect(mockRelease).toHaveBeenCalledTimes(1);
});

it("ignores permission returned after a same-ID reset without releasing newer editing", async () => {
  const permission = deferred<void>(); mockPermission.mockImplementation(async (_permissions, granted) => { await permission.promise; await granted(); });
  const view = render(<Harness />); await record(view); expect(history.isEditing()).toBe(true);
  let newer!: ProjectEditLease;
  act(() => { history.reset({ ...source, title: "Reset" }); newer = history.holdEdits()!; });
  await act(async () => permission.resolve());
  expect(mockConfigure).not.toHaveBeenCalled(); expect(mockRecorder.record).not.toHaveBeenCalled(); expect(added).not.toHaveBeenCalled();
  expect(newer.isCurrent()).toBe(true); act(() => newer.release());
});

it("discards an importing voiceover after reset and keeps a newer lease", async () => {
  const imported = deferred<MediaMeta>(); mockImport.mockReturnValue(imported.promise);
  const view = render(<Harness />); await record(view); time += 2000;
  await act(async () => fireEvent.press(view.getByText("common.save"))); expect(history.isEditing()).toBe(true);
  let newer!: ProjectEditLease;
  act(() => { history.reset(source); newer = history.holdEdits()!; });
  await act(async () => imported.resolve(recorded));
  expect(added).not.toHaveBeenCalled(); expect(newer.isCurrent()).toBe(true); act(() => newer.release());
});

it("cancels an active microphone when reset replaces the same project", async () => {
  const view = render(<Harness />); await record(view); time += 2000;
  await act(async () => history.reset(source));
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1); expect(mockRelease).toHaveBeenCalledTimes(1); expect(mockImport).not.toHaveBeenCalled(); expect(history.isEditing()).toBe(false);
});

it("refuses microphone permission that completes after backgrounding", async () => {
  const permission = deferred<void>(); mockPermission.mockImplementation(async (_permissions, granted) => { await permission.promise; await granted(); });
  const view = render(<Harness />); await record(view);
  act(() => { mockState = "background"; for (const listener of mockListeners) listener(mockState); });
  await act(async () => permission.resolve());
  expect(mockConfigure).not.toHaveBeenCalled(); expect(mockRecorder.record).not.toHaveBeenCalled(); expect(history.isEditing()).toBe(false);
});

it("discards late camera results after resetting the project", async () => {
  const camera = deferred<{ canceled: boolean; assets: { uri: string; width: number; height: number; duration: number }[] }>(); mockCamera.mockReturnValue(camera.promise);
  const view = render(<Harness />); await act(async () => fireEvent.press(view.getByText("common.recordVideo")));
  act(() => history.reset(source));
  await act(async () => camera.resolve({ canceled: false, assets: [{ uri: "file:camera.mp4", width: 640, height: 360, duration: 2000 }] }));
  expect(mockImport).not.toHaveBeenCalled(); expect(added).not.toHaveBeenCalled(); expect(history.isEditing()).toBe(false);
});

it("discards late camera imports after a same-ID reset", async () => {
  mockCamera.mockResolvedValue({ canceled: false, assets: [{ uri: "file:camera.mp4", width: 640, height: 360, duration: 2000 }] });
  const imported = deferred<MediaMeta>(); mockImport.mockReturnValue(imported.promise);
  const view = render(<Harness />); await act(async () => fireEvent.press(view.getByText("common.recordVideo")));
  expect(history.isEditing()).toBe(true); act(() => history.reset(source));
  await act(async () => imported.resolve({ ...recorded, kind: "video" })); expect(added).not.toHaveBeenCalled(); expect(history.isEditing()).toBe(false);
});

it("accepts the camera app returning to the same unchanged editor", async () => {
  const camera = deferred<{ canceled: boolean; assets: { uri: string; width: number; height: number; duration: number }[] }>(); mockCamera.mockReturnValue(camera.promise);
  const view = render(<Harness />); await act(async () => fireEvent.press(view.getByText("common.recordVideo")));
  act(() => { mockState = "inactive"; for (const listener of mockListeners) listener(mockState); }); expect(history.isEditing()).toBe(true);
  mockState = "active";
  await act(async () => camera.resolve({ canceled: false, assets: [{ uri: "file:camera.mp4", width: 640, height: 360, duration: 2000 }] }));
  expect(added).toHaveBeenCalledWith(recorded, 3); expect(history.isEditing()).toBe(false);
});

it("preserves Redo and releases the microphone when a take is cancelled", async () => {
  const view = render(<Harness />); act(() => { history.commit({ ...source, title: "Edited" }); history.undo(); });
  await record(view); time += 2000; await act(async () => fireEvent.press(view.getByText("common.cancel")));
  expect(added).not.toHaveBeenCalled(); expect(mockImport).not.toHaveBeenCalled(); expect(history.canRedo).toBe(true); expect(history.isEditing()).toBe(false);
  act(() => history.redo()); expect(history.latest()!.title).toBe("Edited");
});
