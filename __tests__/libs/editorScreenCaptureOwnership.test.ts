import { ownScreenCapture, type ScreenRecordingResult } from "../../libs/editor/screenCaptureOwnership";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const result = (sessionId = "take-a"): ScreenRecordingResult => ({ sessionId, uri: "file:///screen/take.mp4", width: 1280, height: 720, durationMs: 1500 });
function driver() {
  return { start: jest.fn(async () => {}), finish: jest.fn(async () => result()), cancel: jest.fn(async (_sessionId: string) => {}) };
}

it("retains narration and session ownership through permission, then saves a take only once", async () => {
  const native = driver(), permission = deferred<void>(); native.start.mockReturnValue(permission.promise);
  const capture = ownScreenCapture(native, { sessionId: "take-a", microphone: true }, () => true);
  expect(native.start).toHaveBeenCalledWith({ sessionId: "take-a", microphone: true });
  const first = capture.save(), second = capture.save(); expect(first).toBe(second); expect(native.finish).not.toHaveBeenCalled();
  permission.resolve(); expect(await first).toEqual(result());
  expect(native.finish).toHaveBeenCalledTimes(1); expect(native.finish).toHaveBeenCalledWith("take-a"); expect(native.cancel).not.toHaveBeenCalled();
});

it("invalidates a pending OS consent and never imports its late successful start", async () => {
  const native = driver(), permission = deferred<void>(); native.start.mockReturnValue(permission.promise);
  const capture = ownScreenCapture(native, { sessionId: "take-a", microphone: false }, () => true);
  await capture.cancel(); expect(native.cancel).toHaveBeenCalledWith("take-a");
  permission.resolve(); expect(await capture.ready).toBe(false); expect(await capture.save()).toBeNull();
  expect(native.finish).not.toHaveBeenCalled(); expect(native.cancel).toHaveBeenCalledTimes(1);
});

it("cancels permission resolved under a replaced project even when its ID is unchanged", async () => {
  const native = driver(), permission = deferred<void>(); native.start.mockReturnValue(permission.promise); let current = true;
  const capture = ownScreenCapture(native, { sessionId: "take-a", microphone: false }, () => current);
  current = false; permission.resolve(); expect(await capture.ready).toBe(false);
  expect(native.cancel).toHaveBeenCalledWith("take-a"); expect(await capture.save()).toBeNull(); expect(native.finish).not.toHaveBeenCalled();
});

it("discards a finished file delivered after its original project has been replaced", async () => {
  const native = driver(), saved = deferred<ScreenRecordingResult>(); native.finish.mockReturnValue(saved.promise); let current = true;
  const capture = ownScreenCapture(native, { sessionId: "take-a", microphone: true }, () => current); await capture.ready;
  const pending = capture.save(); await Promise.resolve(); current = false; saved.resolve(result());
  expect(await pending).toBeNull(); expect(native.cancel).toHaveBeenCalledWith("take-a");
});

it("never cancels a newer native session when a departing take finishes late", async () => {
  const native = driver(), saved = deferred<ScreenRecordingResult>(); native.finish.mockReturnValueOnce(saved.promise);
  let firstCurrent = true;
  const first = ownScreenCapture(native, { sessionId: "take-a", microphone: true }, () => firstCurrent); await first.ready;
  const firstSave = first.save(); await Promise.resolve(); firstCurrent = false;
  const replacement = ownScreenCapture(native, { sessionId: "take-b", microphone: false }, () => true); await replacement.ready;
  saved.resolve(result()); expect(await firstSave).toBeNull(); expect(native.cancel.mock.calls).toEqual([["take-a"]]);
  native.finish.mockResolvedValue(result("take-b")); expect(await replacement.save()).toEqual(result("take-b"));
});

it("refuses a native file from a different take", async () => {
  const native = driver(); native.finish.mockResolvedValue(result("take-b"));
  const capture = ownScreenCapture(native, { sessionId: "take-a", microphone: false }, () => true);
  expect(await capture.save()).toBeNull(); expect(native.cancel).toHaveBeenCalledWith("take-a");
});

it.each([
  { ...result(), uri: "https://example.com/video.mp4" },
  { ...result(), width: 0 },
  { ...result(), height: Number.NaN },
  { ...result(), durationMs: 100 },
  { ...result(), durationMs: Number.POSITIVE_INFINITY },
])("refuses incomplete or nonlocal native output %#", async output => {
  const native = driver(); native.finish.mockResolvedValue(output);
  const capture = ownScreenCapture(native, { sessionId: "take-a", microphone: false }, () => true);
  expect(await capture.save()).toBeNull(); expect(native.cancel).toHaveBeenCalledTimes(1);
});

it("releases its native session when the OS picker fails", async () => {
  const native = driver(); native.start.mockRejectedValue(new Error("permission denied"));
  const capture = ownScreenCapture(native, { sessionId: "take-a", microphone: false }, () => true);
  await expect(capture.ready).rejects.toThrow("permission denied"); expect(native.cancel).toHaveBeenCalledWith("take-a");
});

it("releases its native session after encoder failure and never returns a file", async () => {
  const native = driver(); native.finish.mockRejectedValue(new Error("encoder failed"));
  const capture = ownScreenCapture(native, { sessionId: "take-a", microphone: false }, () => true);
  await expect(capture.save()).rejects.toThrow("encoder failed"); expect(native.cancel).toHaveBeenCalledWith("take-a");
});
