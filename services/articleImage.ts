import { xhrUploadFormData } from "../libs/xhr-upload";
import { prepareImageForUpload } from "../libs/assets.util";

type Picked = { uri: string; width?: number; height?: number; mimeType?: string | null; fileName?: string | null };

/**
 * Uploads one picture for the inside of an article and returns the address
 * that goes in the body, carrying its size (`#w=..&h=..`) so readers can hold
 * its space before it loads.
 */
export async function uploadArticleImage(asset: Picked): Promise<string> {
  const ready = await prepareImageForUpload(asset);
  const fd = new FormData();
  const type = ready.mimeType || "image/jpeg";
  const name = ready.fileName || `article-image.${type.split("/")[1] || "jpg"}`;
  // @ts-ignore RN FormData file shape
  fd.append("file", { uri: ready.uri, name, type } as any);
  const res = await xhrUploadFormData<any>({ endpoint: "/article_image", formData: fd, abortRef: { current: false } });
  const url = (res?.result ?? res)?.url;
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) throw new Error("Upload failed");
  return ready.width && ready.height ? `${url}#w=${ready.width}&h=${ready.height}` : url;
}
