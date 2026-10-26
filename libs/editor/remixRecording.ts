export const MAX_REMIX_RECORDING_BYTES = 25 * 1024 * 1024;

export function readRemixRecording(message: { dataUrl?: unknown; duration?: unknown; width?: unknown; height?: unknown }) {
  if (typeof message.dataUrl !== "string" || message.dataUrl.length > Math.ceil(MAX_REMIX_RECORDING_BYTES * 4 / 3) + 64 ||
      typeof message.duration !== "number" || !Number.isFinite(message.duration) || message.duration <= 0 || message.duration > 61 ||
      message.width !== 720 || (message.height !== 720 && message.height !== 1280)) return null;
  const match = /^data:(video\/(?:mp4|webm));base64,([A-Za-z0-9+/]+={0,2})$/.exec(message.dataUrl);
  if (!match || match[2].length % 4 !== 0) return null;
  const padding = match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0;
  const bytes = match[2].length / 4 * 3 - padding;
  if (bytes < 1 || bytes > MAX_REMIX_RECORDING_BYTES) return null;
  return { mime: match[1], base64: match[2], duration: message.duration, width: message.width, height: message.height, extension: match[1] === "video/mp4" ? "mp4" : "webm" };
}
