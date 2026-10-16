import { qrPreviewPath, validQrGraphic, type QrGraphic } from "./qrGraphic";
export function qrSvgDocument(qr: QrGraphic, size = 1024): string {
  if (!qr || !validQrGraphic(qr) || !Number.isInteger(size) || size < 64 || size > 8192) throw new Error("Create a valid QR code before downloading it");
  const edge = qr.cells.length + (qr.quietZone ?? 4) * 2;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${edge} ${edge}" role="img" aria-labelledby="qr-title" shape-rendering="crispEdges"><title id="qr-title">QR code</title><rect width="${edge}" height="${edge}" fill="${qr.background}"/><path d="${qrPreviewPath(qr)}" fill="${qr.foreground}"/></svg>\n`;
}
