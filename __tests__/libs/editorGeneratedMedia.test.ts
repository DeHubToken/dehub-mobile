import { assertGeneratedMediaUrl, generatedMediaFormat, generatedMediaName } from "../../libs/editor/generatedMedia";

describe("generated media formats", () => {
  it("retains actual WAV, WebM and PNG output instead of forcing a requested extension", () => {
    expect(generatedMediaFormat("audio", "https://media.example/output.mp3", "audio/x-wav; charset=binary")).toEqual({ mime: "audio/wav", ext: "wav" });
    expect(generatedMediaFormat("video", "https://media.example/output.mp4", "video/webm")).toEqual({ mime: "video/webm", ext: "webm" });
    expect(generatedMediaFormat("image", "data:image/png;base64,aGVsbG8=")).toEqual({ mime: "image/png", ext: "png" });
  });
  it("infers compatible file extensions when a download has no media content type", () => {
    expect(generatedMediaFormat("audio", "https://media.example/voice.ogg?token=1", "application/octet-stream")).toEqual({ mime: "audio/ogg", ext: "ogg" });
    expect(generatedMediaFormat("image", "https://media.example/output.jpeg#preview").ext).toBe("jpg");
    expect(generatedMediaFormat("video", "https://media.example/result").ext).toBe("mp4");
  });
  it("rejects server error pages and mismatched media kinds before timeline import", () => {
    expect(() => generatedMediaFormat("video", "https://media.example/output.mp4", "text/html")).toThrow();
    expect(() => generatedMediaFormat("audio", "https://media.example/voice.mp3", "video/mp4")).toThrow();
    expect(() => generatedMediaFormat("image", "data:video/mp4;base64,aGVsbG8=")).toThrow();
    expect(() => assertGeneratedMediaUrl("javascript:alert(1)")).toThrow();
    expect(() => assertGeneratedMediaUrl("file:///private")).toThrow();
    expect(() => assertGeneratedMediaUrl("https://media.example/video.mp4")).not.toThrow();
  });
  it("uses short filesystem-safe names", () => {
    expect(generatedMediaName("video", "My / new: video!", "webm")).toBe("my-new-video.webm");
    expect(generatedMediaName("audio", "", "wav")).toBe("audio.wav");
  });
});
