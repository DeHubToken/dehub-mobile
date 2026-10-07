/** Shared export ending; keep the mobile copy identical. */
export const BRAND_OUTRO_DURATION = 2.2;

export function outroUsername(value: unknown): string {
  if (typeof value !== "string") return "";
  return Array.from(value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().replace(/^@+/, "")).slice(0, 40).join("");
}

/** Self-contained so the mobile canvas can use the same renderer. */
export function drawBrandOutro(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, width: number, height: number, time: number, username: string, logo: CanvasImageSource): void {
  const t = Math.max(0, Math.min(2.2, time));
  const reveal = Math.min(1, t / 0.55);
  const ease = 1 - Math.pow(1 - reveal, 3);
  const unit = Math.min(width, height);
  const logoWidth = Math.min(width * 0.68, height * 1.5);
  const logoHeight = logoWidth * 0.3;
  const y = height * 0.43;
  const pulse = 1 + Math.sin(Math.min(1, t / 0.8) * Math.PI) * 0.025;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#080a0f";
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = ease;
  ctx.translate(width / 2, y);
  ctx.scale((0.94 + ease * 0.06) * pulse, (0.94 + ease * 0.06) * pulse);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-logoWidth / 2, -logoHeight / 2, logoWidth * ease, logoHeight);
  ctx.clip();
  ctx.drawImage(logo, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
  ctx.restore();
  ctx.restore();
  ctx.save();
  const textEase = Math.max(0, Math.min(1, (t - 0.35) / 0.4));
  ctx.globalAlpha = textEase;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = username ? "@" + username : "dehub.io";
  let size = Math.max(12, unit * 0.042);
  ctx.font = "600 " + size + "px Inter, system-ui, sans-serif";
  const measured = ctx.measureText(label).width;
  if (measured > width * 0.8) { size *= width * 0.8 / measured; ctx.font = "600 " + size + "px Inter, system-ui, sans-serif"; }
  const textY = y + logoHeight * 0.7 + unit * 0.06 + (1 - textEase) * unit * 0.02;
  ctx.fillText(label, width / 2, textY);
  ctx.globalAlpha = ease * 0.65;
  ctx.fillStyle = "#72e5dc";
  const lineWidth = unit * 0.11 * ease;
  ctx.fillRect((width - lineWidth) / 2, textY + unit * 0.06, lineWidth, Math.max(1, unit * 0.002));
  ctx.restore();
}

/** An original two-note sound, synthesised locally at any sample rate. */
export function outroSoundSample(time: number): number {
  let sample = 0;
  for (let i = 0; i < 2; i++) {
    const t = time - (i === 0 ? 0.12 : 0.42);
    if (t <= 0 || t >= 1.15) continue;
    const freq = i === 0 ? 523.251 : 783.991;
    const envelope = (1 - Math.exp(-t * 90)) * Math.exp(-t * 7) * Math.min(1, (1.15 - t) / 0.08);
    sample += 0.13 * envelope * (Math.sin(2 * Math.PI * freq * t) + 0.2 * Math.sin(2 * Math.PI * freq * 2 * t));
  }
  return sample;
}
