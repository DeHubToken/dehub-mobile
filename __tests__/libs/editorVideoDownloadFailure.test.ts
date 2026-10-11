import { videoDownloadFailure } from "../../libs/editor/videoDownloadFailure";

describe("video download failure details", () => {
  it("reads browser and bridge exception fields without copying their other data", () => {
    expect(videoDownloadFailure({ name: "EncodingError", message: "Encoder failed", source: "private" }, { stage: "export" })).toEqual({ name: "EncodingError", message: "Encoder failed", stage: "export" });
  });
  it("retains the failing frame and stage without including source URLs", () => {
    const error = new Error("Video frame did not load at 14.633s (current 14.600s, ready 2, seeking true) https://cdn.example/video.mp4?token=private");
    const result = videoDownloadFailure(error, { stage: "Encoding frame 440 / 970", progress: 0.47, width: 3840, height: 2160 });
    expect(result).toMatchObject({ name: "Error", stage: "Encoding frame 440 / 970", progress: 0.47, width: 3840, height: 2160 });
    expect(result.message).toContain("14.633s"); expect(result.message).not.toContain("token"); expect(result.message).not.toContain("cdn.example");
  });
  it("omits object payloads and invalid media metrics", () => {
    expect(videoDownloadFailure({ url: "https://cdn.example/private", request: { username: "private" } }, { stage: "download", progress: Number.NaN, width: -1, height: Number.POSITIVE_INFINITY })).toEqual({ stage: "download", name: "Error", message: "Unknown download failure" });
  });
  it("redacts blob and device paths and bounds string diagnostics", () => {
    const result = videoDownloadFailure("Failed blob:https://dehub.io/private file:///private/cache.mp4 " + "x".repeat(700), { stage: "save", progress: 2 });
    expect(result.message).not.toContain("private"); expect(result.message.length).toBe(600); expect(result.progress).toBe(1);
  });
});
