/** QR drawing shared with the web compositor. */
export const QR_GRAPHIC_RUNTIME = String.raw`function drawQrGraphic(ctx, width, height, qr) {
  const count = qr.cells?.length;
  if (!count || count < 21 || count > 177 || qr.cells.some(row => typeof row !== "string" || row.length !== count || !/^[01]+$/.test(row))) return;
  const size = Math.min(width, height), left = -size / 2, top = -size / 2, cell = size / (count + 8);
  ctx.fillStyle = qr.background; ctx.fillRect(left, top, size, size);
  ctx.fillStyle = qr.foreground;
  qr.cells.forEach((row, y) => {
    for (let x = 0; x < count; x++) if (row[x] === "1") {
      const x0 = Math.round((x + 4) * cell), y0 = Math.round((y + 4) * cell);
      ctx.fillRect(left + x0, top + y0, Math.round((x + 5) * cell) - x0, Math.round((y + 5) * cell) - y0);
    }
  });
}`;
