import { recoverScreenCaptures, screenCaptureCapabilities, screenCaptureDriver } from "../../../modules/screen-capture";

const mockNative = { capabilities: jest.fn(), start: jest.fn(), finish: jest.fn(), cancel: jest.fn(), status: jest.fn(), recover: jest.fn(), acknowledge: jest.fn(), addListener: jest.fn() };
const mockResolve = jest.fn(), mockDigest = jest.fn();
jest.mock("expo-modules-core", () => ({ requireNativeModule: (...args: unknown[]) => mockResolve(...args) }));
jest.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "SHA256" }, digestStringAsync: (...args: unknown[]) => mockDigest(...args) }));
const key = "a".repeat(64), options = { scope: "account|project", playhead: 1.25, systemAudio: true, title: "Record", save: "Save", cancel: "Cancel" };
const result = { sessionId: "capture_123", scopeKey: key, playheadMs: 1250, uri: "file:///capture.mp4", width: 640, height: 360, durationMs: 2000 };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  jest.resetAllMocks(); mockResolve.mockReturnValue(mockNative); mockDigest.mockResolvedValue(key);
  mockNative.start.mockResolvedValue(undefined); mockNative.cancel.mockResolvedValue(undefined); mockNative.finish.mockResolvedValue(result);
  mockNative.capabilities.mockResolvedValue({ available: true, systemAudio: true, microphone: true, background: true });
  mockNative.recover.mockResolvedValue([]); mockNative.addListener.mockReturnValue({ remove: jest.fn() });
});

it("keeps an old native binary usable when system capture is absent", async () => {
  mockResolve.mockImplementation(() => { throw new Error("Missing module"); });
  expect(await screenCaptureCapabilities()).toEqual({ available: false, systemAudio: false, microphone: false, background: false });
  expect(await recoverScreenCaptures(options.scope)).toEqual([]);
});
it("hashes the account and project and passes the original playhead to native consent", async () => {
  const bridge = screenCaptureDriver(options);
  await bridge.driver.start({ sessionId: result.sessionId, microphone: true });
  expect(mockDigest).toHaveBeenCalledWith("SHA256", options.scope);
  expect(mockNative.start).toHaveBeenCalledWith(result.sessionId, key, 1250, true, true, "Record", "Save", "Cancel");
  expect(await bridge.driver.finish(result.sessionId)).toEqual(result);
});
it("never opens OS consent after cancellation while the scope is being hashed", async () => {
  const digest = deferred<string>(); mockDigest.mockReturnValue(digest.promise);
  const bridge = screenCaptureDriver(options), ready = bridge.driver.start({ sessionId: result.sessionId, microphone: false });
  await bridge.driver.cancel(result.sessionId); digest.resolve(key);
  await expect(ready).rejects.toThrow("cancelled"); expect(mockNative.start).not.toHaveBeenCalled();
});
it.each([{ scopeKey: "b".repeat(64) }, { playheadMs: 9000 }])("rejects native completion that changed its original binding: %j", async patch => {
  mockNative.finish.mockResolvedValue({ ...result, ...patch });
  const bridge = screenCaptureDriver(options);
  await expect(bridge.driver.finish(result.sessionId)).rejects.toThrow("different project");
  expect(mockNative.cancel).toHaveBeenCalledWith(result.sessionId);
});
it("filters foreign events by session, account, project, and original playhead", async () => {
  const bridge = screenCaptureDriver(options), changed = jest.fn(); bridge.subscribe(result.sessionId, changed);
  const listener = mockNative.addListener.mock.calls[0][1];
  listener({ ...result, sessionId: "foreign_123" }); listener({ ...result, scopeKey: "b".repeat(64) }); listener({ ...result, playheadMs: 9000 });
  listener({ ...result, state: "completed" }); await Promise.resolve(); await Promise.resolve();
  expect(changed).toHaveBeenCalledTimes(1);
});
it("resumes a retained completion without requesting fresh capture permission", async () => {
  const saved = { ...result, state: "completed" }, bridge = screenCaptureDriver(options, saved);
  await bridge.driver.start({ sessionId: result.sessionId, microphone: true });
  expect(mockNative.start).not.toHaveBeenCalled();
  expect(await bridge.driver.finish(result.sessionId)).toEqual(result);
});
it("only offers completed files from the requested scope with valid playheads", async () => {
  mockNative.recover.mockResolvedValue([{ ...result, state: "completed" }, { ...result, state: "recording" }, { ...result, scopeKey: "b".repeat(64), state: "completed" }, { ...result, playheadMs: NaN, state: "completed" }]);
  expect(await recoverScreenCaptures(options.scope)).toEqual([{ ...result, state: "completed" }]);
});
