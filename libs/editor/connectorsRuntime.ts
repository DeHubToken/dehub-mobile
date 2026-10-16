export const CONNECTORS_RUNTIME = String.raw`function connectorGeometry(width, height, style) {
  const x = width / 2, y = height / 2, bend = -x + width * Math.max(0.1, Math.min(0.9, style.bend));
  return { points: style.route === "elbow" ? [[-x, -y], [bend, -y], [bend, y], [x, y]] : [[-x, -y], [x, y]], controls: style.route === "curve" ? [[bend, -y], [bend, y]] : null };
}

function drawConnector(ctx, width, height, style) {
  const geometry = connectorGeometry(width, height, style), points = geometry.points, controls = geometry.controls;
  ctx.save(); ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]); ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (controls) ctx.bezierCurveTo(controls[0][0], controls[0][1], controls[1][0], controls[1][1], points[1][0], points[1][1]);
  else for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
  ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = ctx.strokeStyle;
  const size = Math.min(width / 5, Math.max(ctx.lineWidth * 3.5, width / 35));
  for (const end of [false, true]) {
    const cap = end ? style.end : style.start;
    if (cap === "none") continue;
    const tip = end ? points[points.length - 1] : points[0];
    const from = controls ? controls[end ? 1 : 0] : points[end ? points.length - 2 : 1];
    const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    const dx = Math.cos(angle), dy = Math.sin(angle), cx = tip[0] - dx * size / 2, cy = tip[1] - dy * size / 2;
    ctx.beginPath();
    if (cap === "circle") ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    else {
      ctx.moveTo(tip[0], tip[1]);
      ctx.lineTo(cx - dy * size / 2, cy + dx * size / 2);
      if (cap === "diamond") ctx.lineTo(tip[0] - dx * size, tip[1] - dy * size);
      else ctx.lineTo(tip[0] - dx * size * 0.85, tip[1] - dy * size * 0.85);
      ctx.lineTo(cx + dy * size / 2, cy - dx * size / 2); ctx.closePath();
    }
    ctx.fill();
  }
  ctx.restore();
}

`;
