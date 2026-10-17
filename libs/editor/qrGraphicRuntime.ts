export const QR_GRAPHIC_RUNTIME = String.raw`function drawQrGraphic(ctx, width, height, qr) {
  const count = qr.cells?.length;
  if (!count || count < 21 || count > 177 || qr.cells.some(row => typeof row !== "string" || row.length !== count || !/^[01]+$/.test(row))) return;
  const margin = Math.max(4, Math.min(8, Math.round(qr.quietZone || 4)));
  const size = Math.min(width, height), left = -size / 2, top = -size / 2, cell = size / (count + margin * 2);
  ctx.fillStyle = qr.background; ctx.fillRect(left, top, size, size);
  ctx.fillStyle = qr.foreground;
  qr.cells.forEach((row, y) => {
    for (let x = 0; x < count; x++) if (row[x] === "1") {
      const x0 = Math.round((x + margin) * cell), y0 = Math.round((y + margin) * cell);
      ctx.fillRect(left + x0, top + y0, Math.round((x + margin + 1) * cell) - x0, Math.round((y + margin + 1) * cell) - y0);
    }
  });
}

`;
