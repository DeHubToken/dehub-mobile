import { generatedProject } from "../../libs/editor/generatedProject";
import { newProject } from "../../libs/editor/project";
import type { MediaMeta } from "../../libs/editor/storage";

const media: MediaMeta = { id: "media-1", name: "generated-video.mp4", kind: "video", mimeType: "video/mp4", width: 1920, height: 1080, duration: 12.5, file: "media.mp4", createdAt: 1 };
it("creates a separate design with the complete generated video and its orientation", () => {
  const original = newProject("9:16", "My saved design");
  const result = generatedProject(media);
  expect(result.id).not.toBe(original.id); expect(original.clips).toEqual([]);
  expect(result.settings.aspectPreset).toBe("16:9");
  expect(result.clips).toEqual([expect.objectContaining({ mediaId: "media-1", duration: 12.5, sourceDuration: 12.5, trimIn: 0 })]);
});
it("uses an audio track with the complete voice/music source and a centred phone canvas", () => {
  const result = generatedProject({ ...media, kind: "audio", width: 0, height: 0, duration: 47 });
  expect(result.clips[0]).toMatchObject({ kind: "audio", duration: 47, sourceDuration: 47 });
  expect(result.tracks.find(track => track.id === result.clips[0].trackId)?.kind).toBe("audio");
  expect(result.settings.aspectPreset).toBe("9:16");
});
it("supports square stills and rejects incomplete metadata instead of silently truncating a movie", () => {
  expect(generatedProject({ ...media, kind: "image", width: 1024, height: 1024 }).settings.aspectPreset).toBe("1:1");
  expect(generatedProject({ ...media, kind: "image", width: 1024, height: 1280 }).settings.aspectPreset).toBe("4:5");
  expect(() => generatedProject({ ...media, duration: undefined })).toThrow("duration");
});
