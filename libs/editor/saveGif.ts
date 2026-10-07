import { saveEditorDownload } from "./saveEditorDownload";

/** Copy in bounded pieces so saving a GIF never creates a second full base64 string. */
export async function saveGif(uri: string, title: string): Promise<void> {
  await saveEditorDownload(uri, title, "gif", "image/gif");
}
