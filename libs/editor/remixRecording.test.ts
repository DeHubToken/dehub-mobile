import { MAX_REMIX_RECORDING_BYTES, readRemixRecording } from "./remixRecording";

describe("remix recording bridge", () => {
  test("accepts bounded MP4 and WebM recordings", () => {
    expect(readRemixRecording({ dataUrl: "data:video/mp4;base64,AAAA", duration: 60, width: 720, height: 1280 })?.extension).toBe("mp4");
    expect(readRemixRecording({ dataUrl: "data:video/webm;base64,AQ==", duration: 0.5, width: 720, height: 720 })?.base64).toBe("AQ==");
  });
  test.each([0, -1, 62, NaN, Infinity, "3", undefined])("rejects invalid duration %s", duration => {
    expect(readRemixRecording({ dataUrl: "data:video/webm;base64,AAAA", duration, width: 720, height: 1280 })).toBeNull();
  });
  test.each(["data:text/html;base64,AAAA", "https://example.com/video.mp4", "data:video/mp4;base64,AA", "data:video/mp4;base64,AA=A", "data:video/mp4;base64,"])("rejects malformed recording %s", dataUrl => {
    expect(readRemixRecording({ dataUrl, duration: 1, width: 720, height: 1280 })).toBeNull();
  });
  test("rejects payloads over the memory bound", () => {
    expect(readRemixRecording({ dataUrl: "data:video/webm;base64," + "A".repeat(Math.ceil(MAX_REMIX_RECORDING_BYTES / 3) * 4), duration: 1, width: 720, height: 1280 })).toBeNull();
  });
  test.each([[0, 1280], [720, 0], [720, 1920], [1280, 720], [720, undefined]])("rejects unsupported dimensions %s x %s", (width, height) => {
    expect(readRemixRecording({ dataUrl: "data:video/webm;base64,AAAA", duration: 1, width, height })).toBeNull();
  });
});
