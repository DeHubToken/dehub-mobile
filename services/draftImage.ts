import { xhrUploadFormData, type XhrUploadError } from "../libs/xhr-upload";

/**
 * Composer photos upload as soon as they are attached or edited, while the
 * post is still being written. At Post the queue sends the ids of the ones
 * that finished and only the files that did not. In memory only: after a
 * restart every photo is simply sent with the post, as before.
 */
const uploads = new Map<string, Promise<string | null>>();
/** Off once the server answers that it has no draft photos. */
let unsupported = false;

export function startDraftImage(media: { uri: string; name: string; mimeType: string }): void {
  if (unsupported || uploads.has(media.uri)) return;
  const fd = new FormData();
  // @ts-ignore RN FormData file shape
  fd.append("file", { uri: media.uri, name: media.name, type: media.mimeType } as any);
  const promise = xhrUploadFormData<any>({ endpoint: "/draft_image", formData: fd, abortRef: { current: false } })
    .then((res) => {
      const id = (res?.result ?? res)?.draftImageId;
      return typeof id === "string" ? id : null;
    })
    .catch((e: XhrUploadError) => {
      if (e?.status === 404 || e?.status === 503) unsupported = true;
      uploads.delete(media.uri);
      return null;
    });
  uploads.set(media.uri, promise);
}

/**
 * Draft ids for `uris` in display order (null = that file goes with the post),
 * or null when none went up early. Waits for uploads already running.
 */
export async function resolveDraftImages(uris: string[]): Promise<(string | null)[] | null> {
  if (unsupported || uris.length === 0) return null;
  const ids = await Promise.all(uris.map((u) => uploads.get(u) ?? Promise.resolve(null)));
  return ids.some(Boolean) ? ids : null;
}

/** The post went up with these photos. */
export function forgetDraftImages(uris: string[]): void {
  for (const u of uris) uploads.delete(u);
}
