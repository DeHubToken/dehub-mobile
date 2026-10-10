import { acquireRecordingAudio } from "../../libs/editor/recordingAudioSession";
import { configureForRecording, releaseRecording } from "../../libs/audioSession";
jest.mock("../../libs/audioSession", () => ({ configureForRecording: jest.fn(), releaseRecording: jest.fn() }));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { jest.mocked(configureForRecording).mockReset().mockResolvedValue(undefined); jest.mocked(releaseRecording).mockReset().mockResolvedValue(undefined); });

it("waits for departing audio cleanup before configuring a replacement editor", async () => {
  const cleanup = deferred(); jest.mocked(releaseRecording).mockReturnValueOnce(cleanup.promise);
  const first = await acquireRecordingAudio(() => true); const closing = first!();
  const replacement = acquireRecordingAudio(() => true); await Promise.resolve();
  expect(configureForRecording).toHaveBeenCalledTimes(1);
  cleanup.resolve(); await closing; const second = await replacement;
  expect(configureForRecording).toHaveBeenCalledTimes(2); await second!(); expect(releaseRecording).toHaveBeenCalledTimes(2);
});

it("never configures a queued take that has already been cancelled", async () => {
  const first = await acquireRecordingAudio(() => true); let current = true;
  const queued = acquireRecordingAudio(() => current); current = false; await first!();
  expect(await queued).toBeNull(); expect(configureForRecording).toHaveBeenCalledTimes(1);
});

it("cleans late configuration once and leaves the queue available for the next take", async () => {
  const configured = deferred(); jest.mocked(configureForRecording).mockReturnValueOnce(configured.promise);
  let current = true; const pending = acquireRecordingAudio(() => current); await Promise.resolve(); current = false; configured.resolve();
  expect(await pending).toBeNull(); expect(releaseRecording).toHaveBeenCalledTimes(1);
  const next = await acquireRecordingAudio(() => true); const close = next!(); expect(next!()).toBe(close); await close;
  expect(releaseRecording).toHaveBeenCalledTimes(2);
});
