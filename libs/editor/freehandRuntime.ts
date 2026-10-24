export const FREEHAND_RUNTIME = String.raw`function sampleStroke(points) {
  const count = Math.min(8192, points.length);
  return Array.from({ length: count }, (_, index) => points[Math.round(index * (points.length - 1) / Math.max(1, count - 1))]).filter(point => point && point.length === 2 && point.every(Number.isFinite));
}

function freehandCommands(points, width, height, smoothing = 1, closed = false) {
  const p = sampleStroke(points), commands = [];
  if (!p.length) return commands;
  const amount = Math.max(0, Math.min(1, smoothing)) / 2, x = (index) => p[index][0] * width, y = (index) => p[index][1] * height;
  if (p.length === 1) return [["M", x(0), y(0)], ["L", x(0) + 0.01, y(0)]];
  if (closed) {
    const last = p.length - 1;
    commands.push(["M", x(last) * (1 - amount) + x(0) * amount, y(last) * (1 - amount) + y(0) * amount]);
    for (let index = 0; index < p.length; index++) { const next = (index + 1) % p.length; commands.push(["Q", x(index), y(index), x(index) * (1 - amount) + x(next) * amount, y(index) * (1 - amount) + y(next) * amount]); }
    commands.push(["Z"]);
  } else {
    commands.push(["M", x(0), y(0)]);
    for (let index = 1; index < p.length - 1; index++) commands.push(["Q", x(index), y(index), x(index) * (1 - amount) + x(index + 1) * amount, y(index) * (1 - amount) + y(index + 1) * amount]);
    commands.push(["L", x(p.length - 1), y(p.length - 1)]);
  }
  return commands;
}

function freehandPath(ctx, width, height, points, smoothing = 1, closed = false) {
  ctx.beginPath();
  for (const command of freehandCommands(points, width, height, smoothing, closed)) {
    if (command[0] === "M") ctx.moveTo(command[1], command[2]);
    else if (command[0] === "L") ctx.lineTo(command[1], command[2]);
    else if (command[0] === "Q") ctx.quadraticCurveTo(command[1], command[2], command[3], command[4]);
    else ctx.closePath();
  }
}

`;
