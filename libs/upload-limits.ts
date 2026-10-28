import * as FileSystem from "expo-file-system/legacy";

export const MAX_BUFFERED_UPLOAD_BYTES = 100_000_000;
export const MAX_IMAGE_UPLOAD_BYTES = 42_069_000;

export function assertBufferedUploadSizes(files: { size: number; type?: string }[]): void {
  let total = 0;
  for (const file of files) {
    total += file.size;
    if (total > MAX_BUFFERED_UPLOAD_BYTES ||
        (file.type?.startsWith("image/") && file.size > MAX_IMAGE_UPLOAD_BYTES)) {
      throw Object.assign(new Error(
        "Images must be 42.069 MB or smaller; this upload must total 100 MB or less. Larger videos require resumable upload. Please retry when it is available.",
      ), { status: 413, code: "UPLOAD_TOO_LARGE" });
    }
  }
}

/** Check metadata only; never load file contents into JavaScript memory. */
export async function checkBufferedUploadSize(form: FormData): Promise<void> {
  const files: { size: number; type?: string }[] = [];
  const native = form as FormData & { getParts?: () => { uri?: string; headers?: Record<string, string> }[] };
  if (native.getParts) {
    for (const part of native.getParts()) {
      if (!part.uri) continue;
      try {
        const info = await FileSystem.getInfoAsync(part.uri);
        if (info.exists && !info.isDirectory && Number.isFinite(info.size)) {
          files.push({ size: info.size, type: part.headers?.["content-type"] });
        }
      } catch {
        // Some providers do not expose size. The API enforces actual stream bytes.
      }
    }
  } else if (typeof form.forEach === "function") {
    form.forEach(value => {
      if (typeof value !== "string") files.push({ size: value.size, type: value.type });
    });
  }
  assertBufferedUploadSizes(files);
}
