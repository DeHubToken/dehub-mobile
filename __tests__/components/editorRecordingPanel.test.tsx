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
const mockScreenStart = jest.fn(), mockScreenFinish = jest.fn(), mockScreenCancel = jest.fn(), mockScreenAcknowledge = jest.fn(), mockScreenStatus = jest.fn(), mockScreenRecover = jest.fn(), mockScreenSubscribe = jest.fn();
const mockScreenOptions: unknown[] = [];
const mockScreenCapabilities = jest.fn();
jest.mock("react-native-css-interop/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));
jest.mock("react-native", () => ({ View: "View", Text: "Text", Pressable: "Pressable", Platform: { OS: "android" }, StyleSheet: { flatten: (style: unknown) => style }, AppState: {
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
jest.mock("../../modules/screen-capture", () => ({
  screenCaptureCapabilities: () => mockScreenCapabilities(),
  recoverScreenCaptures: (...args: unknown[]) => mockScreenRecover(...args),
  screenCaptureDriver: (options: unknown, restore: unknown) => {
    mockScreenOptions.push({ options, restore });
    return { driver: { start: (...args: unknown[]) => mockScreenStart(...args), finish: (...args: unknown[]) => mockScreenFinish(...args), cancel: (...args: unknown[]) => mockScreenCancel(...args) },
      acknowledge: (...args: unknown[]) => mockScreenAcknowledge(...args), status: (...args: unknown[]) => mockScreenStatus(...args), subscribe: (...args: unknown[]) => mockScreenSubscribe(...args) };
  },
}));

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const source: ProjectSnapshot = { id: "same", title: "Source", updatedAt: 1, settings: { width: 640, height: 360, fps: 30, aspectPreset: "16:9", background: "#000" }, tracks: [], clips: [] };
const recorded: MediaMeta = { id: "take", name: "take.m4a", kind: "audio", mimeType: "audio/mp4", width: 0, height: 0, duration: 2, file: "take.m4a", createdAt: 1 };
let history!: ReturnType<typeof useProjectHistory>, added = jest.fn(), time = 1000;
function Harness({ at = 3, account = "account-a" }: { at?: number; account?: string }) {
  const h = useProjectHistory(source); history = h;
  return <RecordingPanel at={at} recordingScope={`${account}|same`} scope={h.scopeVersion()} subscribe={h.subscribe} onStart={() => h.holdEdits()} onAdd={(media, start) => {
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
  mockScreenOptions.length = 0; mockScreenStart.mockResolvedValue(undefined); mockScreenCancel.mockResolvedValue(undefined);
  mockScreenFinish.mockImplementation(async (sessionId: string) => ({ sessionId, uri: "file:///capture.mp4", width: 640, height: 360, durationMs: 2000 }));
  mockScreenAcknowledge.mockResolvedValue(undefined); mockScreenStatus.mockResolvedValue({ state: "recording" }); mockScreenRecover.mockResolvedValue([]);
  mockScreenSubscribe.mockReturnValue({ remove: jest.fn() });
  mockScreenCapabilities.mockResolvedValue({ available: false, systemAudio: false, microphone: false, background: false });
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
  expect(mockRecorder.record).toHaveBeenCalledTimes(1); expect(history.isEditing()).toBe(true);
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

async function screenView() {
  mockScreenCapabilities.mockResolvedValue({ available: true, systemAudio: true, microphone: true, background: true });
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<Harness />); });
  return view;
}
async function recordScreen(view: ReturnType<typeof render>) {
  await act(async () => fireEvent.press(view.getByText("editor.blend.screen")));
}

it("keeps screen capture running in the background and saves once at its original playhead", async () => {
  const view = await screenView(); await recordScreen(view);
  const id = mockScreenStart.mock.calls[0][0].sessionId;
  act(() => { mockState = "background"; for (const listener of mockListeners) listener(mockState); });
  expect(mockScreenCancel).not.toHaveBeenCalled(); expect(history.isEditing()).toBe(true);
  await act(async () => view.rerender(<Harness at={9} />));
  await act(async () => fireEvent.press(view.getByText("common.save")));
  expect(mockScreenFinish).toHaveBeenCalledWith(id); expect(mockScreenAcknowledge).toHaveBeenCalledWith(id);
  expect(mockImport).toHaveBeenCalledWith(expect.objectContaining({ kind: "video", duration: 2 }));
  expect(added).toHaveBeenCalledWith(recorded, 3); expect(history.isEditing()).toBe(false);
  act(() => history.undo()); expect(history.latest()!.clips).toHaveLength(0);
  act(() => history.redo()); expect(history.latest()!.clips).toHaveLength(1);
});

it("passes the voiceover option without taking over the standalone audio recorder", async () => {
  const view = await screenView();
  await act(async () => fireEvent.press(view.getAllByText("comments.recordVoice")[1]));
  await recordScreen(view);
  expect(mockScreenStart).toHaveBeenCalledWith(expect.objectContaining({ microphone: true }));
  expect(mockConfigure).not.toHaveBeenCalled(); expect(mockRecorder.record).not.toHaveBeenCalled();
  expect(mockScreenOptions[0]).toEqual(expect.objectContaining({ options: expect.objectContaining({ scope: "account-a|same", playhead: 3, systemAudio: true }) }));
});

it("invalidates late OS consent on reset without releasing the replacement project lease", async () => {
  const permission = deferred<void>(); mockScreenStart.mockReturnValue(permission.promise);
  const view = await screenView(); await recordScreen(view);
  const id = mockScreenStart.mock.calls[0][0].sessionId;
  let newer!: ProjectEditLease;
  await act(async () => { history.reset(source); newer = history.holdEdits()!; });
  expect(mockScreenCancel).toHaveBeenCalledWith(id);
  await act(async () => permission.resolve());
  expect(mockScreenFinish).not.toHaveBeenCalled(); expect(added).not.toHaveBeenCalled(); expect(newer.isCurrent()).toBe(true);
  act(() => newer.release());
});

it("discards an importing screen capture after the account changes", async () => {
  const imported = deferred<MediaMeta>(); mockImport.mockReturnValue(imported.promise);
  const view = await screenView(); await recordScreen(view);
  await act(async () => fireEvent.press(view.getByText("common.save")));
  await act(async () => view.rerender(<Harness account="account-b" />));
  await act(async () => imported.resolve(recorded));
  expect(added).not.toHaveBeenCalled(); expect(mockScreenAcknowledge).not.toHaveBeenCalled(); expect(mockScreenCancel).toHaveBeenCalled();
});

it("retains its edit lease when startup status returns during a pending save", async () => {
  const status = deferred<{ state: string }>(), imported = deferred<MediaMeta>();
  mockScreenStatus.mockReturnValue(status.promise); mockImport.mockReturnValue(imported.promise);
  const view = await screenView(); await recordScreen(view);
  await act(async () => fireEvent.press(view.getByText("common.save")));
  await act(async () => status.resolve({ state: "recording" }));
  expect(history.isEditing()).toBe(true); expect(added).not.toHaveBeenCalled();
  await act(async () => imported.resolve(recorded));
  expect(added).toHaveBeenCalledTimes(1); expect(history.isEditing()).toBe(false);
});

it("imports a system notification save when the original editor returns to the foreground", async () => {
  const view = await screenView(); await recordScreen(view);
  mockScreenStatus.mockResolvedValue({ state: "completed" });
  await act(async () => { mockState = "active"; for (const listener of mockListeners) listener(mockState); });
  expect(added).toHaveBeenCalledWith(recorded, 3); expect(mockScreenFinish).toHaveBeenCalledTimes(1);
});

it("offers a retained take explicitly and restores its recorded playhead", async () => {
  const saved = { sessionId: "saved_1234", scopeKey: "saved-scope", playheadMs: 1250, state: "completed" };
  mockScreenRecover.mockResolvedValue([saved]);
  const view = await screenView(); expect(added).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(view.getByText(/editor.cloud.restore/)));
  expect(mockScreenOptions[0]).toEqual(expect.objectContaining({ options: expect.objectContaining({ playhead: 1.25 }), restore: saved }));
  expect(added).toHaveBeenCalledWith(recorded, 1.25); expect(mockScreenAcknowledge).toHaveBeenCalledWith(saved.sessionId);
});

it("preserves Redo when a screen take is cancelled", async () => {
  const view = await screenView(); act(() => { history.commit({ ...source, title: "Edited" }); history.undo(); });
  await recordScreen(view);
  await act(async () => fireEvent.press(view.getByText("common.cancel")));
  expect(mockScreenFinish).not.toHaveBeenCalled(); expect(mockImport).not.toHaveBeenCalled(); expect(history.canRedo).toBe(true);
  act(() => history.redo()); expect(history.latest()!.title).toBe("Edited");
});
