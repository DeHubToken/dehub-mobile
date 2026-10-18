import type { MediaDescriptor } from "./media";

type T = (key: string, opts?: Record<string, unknown>) => string;

/** What a preview line says for an encrypted attachment (never its descriptor). */
export function encryptedMediaLabel(d: MediaDescriptor, t: T): string {
  switch (d.kind) {
    case "image":
      return t("dm.photo");
    case "video":
      return t("dm.video");
    case "audio":
      return t("dm.voiceNote");
    default:
      return d.name || t("dm.attachment");
  }
}
