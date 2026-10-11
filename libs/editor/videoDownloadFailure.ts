export interface VideoDownloadFailureInfo { stage: string; progress?: number; width?: number; height?: number }
export function videoDownloadFailure(error: unknown, info: VideoDownloadFailureInfo) {
  const details = typeof error === "object" && error !== null ? error as { name?: unknown; message?: unknown } : null;
  const message = typeof details?.message === "string" ? details.message : typeof error === "string" ? error : "Unknown download failure";
  return {
    stage: info.stage,
    name: typeof details?.name === "string" ? details.name : "Error",
    message: message.replace(/\b(?:https?|blob|file):\S+/gi, "[media]").slice(0, 600),
    ...(Number.isFinite(info.progress) ? { progress: Math.max(0, Math.min(1, info.progress!)) } : {}),
    ...(Number.isFinite(info.width) && info.width! > 0 ? { width: info.width } : {}),
    ...(Number.isFinite(info.height) && info.height! > 0 ? { height: info.height } : {}),
  };
}
