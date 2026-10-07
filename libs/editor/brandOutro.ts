/** Shared export ending; keep the mobile copy identical. */
export const BRAND_OUTRO_DURATION = 2.2;

export interface BrandOutroArtwork { logo: CanvasImageSource }

export function outroUsername(value: unknown): string {
  if (typeof value !== "string") return "";
  return Array.from(value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().replace(/^@+/, "")).slice(0, 40).join("");
}

/** A small white icon twists through one spin, settles, then reveals the credit. */
export function drawBrandOutro(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, width: number, height: number, time: number, username: string, logo: CanvasImageSource, artwork?: BrandOutroArtwork): void {
  const t = Math.max(0, Math.min(2.2, time));
  const phase = (start: number, length: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, (t - start) / length)), 3);
  const unit = Math.min(width, height);
  const icon = artwork ? artwork.logo : logo;
  const logoWidth = unit * 0.13;
  const logoHeight = logoWidth * 1184 / 908;
  const gap = unit * 0.038;
  const label = username ? "dehub.io/" + username : "dehub.io";
  const progress = Math.max(0, Math.min(1, (t - 0.08) / 0.98));
  const spin = (1 - Math.cos(progress * Math.PI)) / 2;
  const angle = (1 - spin) * Math.PI * 2;
  const wave = Math.sin(progress * Math.PI);
  const textEase = phase(1.08, 0.32);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  let size = Math.max(11, unit * 0.037);
  ctx.font = "500 " + size + "px DeHubOutro, system-ui, sans-serif";
  const measured = ctx.measureText(label).width;
  if (measured > unit * 0.68) { size *= unit * 0.68 / measured; ctx.font = "500 " + size + "px DeHubOutro, system-ui, sans-serif"; }
  const logoY = height / 2 - (gap + size) / 2;
  const textY = height / 2 + (logoHeight + gap) / 2;
  ctx.save();
  ctx.translate(width / 2, logoY);
  ctx.globalAlpha = phase(0.04, 0.16);
  const scale = 0.86 + progress * 0.14 + wave * 0.045;
  ctx.scale(scale, scale);
  if (progress >= 1) {
    ctx.drawImage(icon, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
  } else {
    ctx.rotate(Math.sin(angle) * wave * 0.13);
    const sourceWidth = (icon as HTMLCanvasElement).width || 256;
    const sourceHeight = (icon as HTMLCanvasElement).height || Math.ceil(256 * 1184 / 908);
    const strips = 32;
    for (let i = 0; i < strips; i++) {
      const v = (i + 0.5) / strips - 0.5;
      const projected = Math.cos(angle + v * wave * 1.15);
      const stripWidth = logoWidth * Math.max(0.055, Math.abs(projected));
      const stripHeight = logoHeight / strips * (1 - wave * 0.07);
      const x = Math.sin(angle + v * 2) * logoWidth * wave * 0.12;
      ctx.save();
      ctx.translate(x, v * logoHeight * (1 - wave * 0.07));
      ctx.scale(projected < 0 ? -1 : 1, 1);
      ctx.drawImage(icon, 0, i * sourceHeight / strips, sourceWidth, sourceHeight / strips, -stripWidth / 2, -stripHeight / 2, stripWidth, stripHeight + unit * 0.0015);
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.globalAlpha = textEase;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.beginPath();
  ctx.rect((width - unit * 0.72) / 2, textY - size * 0.8, unit * 0.72, size * 1.6);
  ctx.clip();
  ctx.fillText(label, width / 2, textY + (1 - textEase) * size * 0.9);
  ctx.restore();
}

/** Original soft spin sweep followed by a short resolving chime. */
export function outroSoundSample(time: number): number {
  if (!Number.isFinite(time) || time <= 0.12 || time >= 1.75) return 0;
  let sample = 0;
  const sweep = time - 0.12;
  if (sweep < 0.7) {
    const index = Math.floor(sweep * 48000);
    const hash = (n: number) => ((Math.imul(n + 42, 1664525) ^ Math.imul(n + 137, 1013904223)) >>> 0) / 2147483648 - 1;
    const noise = (hash(index - 1) + 2 * hash(index) + hash(index + 1)) / 4;
    sample += noise * 0.035 * Math.pow(Math.sin(Math.PI * sweep / 0.7), 2);
    sample += 0.045 * Math.sin(2 * Math.PI * (110 * sweep - 30 * sweep * sweep)) * Math.pow(Math.sin(Math.PI * sweep / 0.7), 2);
  }
  for (let i = 0; i < 2; i++) {
    const start = i === 0 ? 0.96 : 1.07;
    const length = i === 0 ? 0.6 : 0.58;
    const t = time - start;
    if (t <= 0 || t >= length) continue;
    const frequency = i === 0 ? 659.255 : 987.767;
    const envelope = (1 - Math.exp(-t * 160)) * Math.exp(-t * 12) * Math.min(1, (length - t) / 0.03);
    sample += (i === 0 ? 0.11 : 0.075) * envelope * (Math.sin(2 * Math.PI * frequency * t) + 0.1 * Math.sin(2 * Math.PI * frequency * 2 * t));
  }
  return sample;
}
