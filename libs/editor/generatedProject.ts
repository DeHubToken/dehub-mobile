import { newProject, addImage } from "./project";
import { addClip } from "./timeline";
import type { MediaMeta } from "./storage";
import type { AspectPreset } from "./types";

/** A generated result starts its own saved design and keeps the full source. */
export function generatedProject(media: MediaMeta) {
  if (media.kind !== "image" && (!Number.isFinite(media.duration) || !(media.duration && media.duration > 0))) throw new Error("Generated source duration is missing");
  const ratio = media.width > 0 && media.height > 0 ? media.width / media.height : 9 / 16;
  const aspects: [Exclude<AspectPreset, "custom">, number][] = [["16:9", 16 / 9], ["9:16", 9 / 16], ["1:1", 1], ["4:5", 4 / 5]];
  const aspect = aspects.reduce((best, item) => Math.abs(Math.log(item[1] / ratio)) < Math.abs(Math.log(best[1] / ratio)) ? item : best)[0];
  const base = newProject(aspect, media.name.replace(/\.[^.]+$/, ""));
  return media.kind === "image" ? addImage(base, media.id).project
    : addClip(base, { id: media.id, kind: media.kind, duration: media.duration ?? 0 }).project;
}
