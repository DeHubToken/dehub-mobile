/** Shared ending and artwork preparation inside the native canvas. */
export const BRAND_OUTRO_RUNTIME = String.raw`
/** Shared ending; keep the mobile copy identical. */
const BRAND_OUTRO_DURATION = 2.2;


function outroUsername(value) {
  if (typeof value !== "string") return "";
  return Array.from(value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim().replace(/^@+/, "")).slice(0, 40).join("");
}

/** Chrome current uses the official icon and the store artwork's silver material. */
function drawBrandOutro(ctx, width, height, time, username, logo, artwork) {
  const t = Math.max(0, Math.min(2.2, time));
  const phase = (start, length) => 1 - Math.pow(1 - Math.max(0, Math.min(1, (t - start) / length)), 3);
  const entry = phase(0, 0.85), reveal = phase(0.25, 0.65), textEase = phase(0.7, 0.55);
  const unit = Math.min(width, height);
  const logoWidth = unit * 0.273;
  const logoHeight = logoWidth * 1184 / 908;
  const y = height * 0.417;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#030304";
  ctx.fillRect(0, 0, width, height);
  if (artwork) {
    ctx.globalAlpha = 0.78;
    ctx.drawImage(artwork.background, 0, 0, width, height);
    ctx.globalAlpha = 1;
    let seed = 137;
    for (let n = 0; n < 110; n++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const x = seed % width;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      ctx.fillStyle = n % 11 === 0 ? "rgba(235,239,244,.3)" : "rgba(235,239,244,.09)";
      ctx.fillRect(x, seed % height, Math.max(0.7, unit * 0.002), Math.max(0.7, unit * 0.002));
    }
    ctx.globalAlpha = entry * 0.38;
    ctx.lineWidth = Math.max(0.5, unit / 900);
    ctx.strokeStyle = "#b4bdc9";
    for (let j = 0; j < 14; j++) {
      ctx.beginPath();
      for (let x = 0; x <= width; x += Math.max(1, width / 80)) {
        const waveY = height * 0.65 + j * unit * 0.013 + Math.sin(x / width * 5.8 + t * 0.5 + j * 0.15) * unit * 0.083 + Math.cos(x / width * 3 - j * 0.11) * unit * 0.067;
        if (x === 0) ctx.moveTo(x, waveY); else ctx.lineTo(x, waveY);
      }
      ctx.stroke();
    }
    const ornament = (image, x, cy, size, rotation, alpha) => {
      ctx.save(); ctx.translate(x, cy); ctx.rotate(rotation); ctx.globalAlpha = alpha;
      const ratio = image.height / image.width || 1;
      ctx.drawImage(image, -size / 2, -size * ratio / 2, size, size * ratio); ctx.restore();
    };
    ornament(artwork.globe, unit * 0.2 - (1 - entry) * unit * 0.26, height * 0.71, unit * 0.42, -0.2 + (1 - entry) * 0.6, entry * 0.95);
    ornament(artwork.star, width - unit * 0.263 + (1 - entry) * unit * 0.22, height * 0.25, unit * 0.31, 0.17 + (1 - entry) * 0.9, entry);
    ornament(artwork.star, width - unit * 0.287, height * 0.767, unit * 0.12, -0.2, entry * 0.75);
  }
  ctx.globalAlpha = reveal;
  ctx.translate(width / 2, y + (1 - reveal) * unit * 0.041);
  ctx.scale(0.96 + reveal * 0.04, 0.96 + reveal * 0.04);
  for (let d = 4; d > 0; d--) {
    ctx.globalAlpha = reveal * 0.25;
    ctx.drawImage(logo, -logoWidth / 2 + d * unit / 540, -logoHeight / 2 + d * unit / 540, logoWidth, logoHeight);
  }
  ctx.globalAlpha = reveal;
  ctx.drawImage(logo, -logoWidth / 2, -logoHeight / 2, logoWidth, logoHeight);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = textEase;
  ctx.fillStyle = "#f0f0f2";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = username ? "dehub.io/" + username : "dehub.io";
  let size = Math.max(12, unit * 0.078);
  ctx.font = "500 " + size + "px DeHubOutro, system-ui, sans-serif";
  const measured = ctx.measureText(label).width;
  if (measured > width * 0.8) { size *= width * 0.8 / measured; ctx.font = "500 " + size + "px DeHubOutro, system-ui, sans-serif"; }
  const textY = y + logoHeight / 2 + unit * 0.087 + (1 - textEase) * unit * 0.026;
  ctx.fillText(label, width / 2, textY);
  ctx.restore();
}

/** Original silver sweep, low impact and resolving chime; no external sound file. */
function outroSoundSample(time) {
  if (!Number.isFinite(time) || time <= 0.12 || time >= 1.75) return 0;
  let sample = 0;
  const noiseTime = time - 0.12;
  if (noiseTime < 0.58) {
    const index = Math.floor(noiseTime * 48000);
    const hash = (n) => ((Math.imul(n + 42, 1664525) ^ Math.imul(n + 137, 1013904223)) >>> 0) / 2147483648 - 1;
    const noise = (hash(index - 1) + 2 * hash(index) + hash(index + 1)) / 4;
    sample += noise * 0.06 * Math.sin(Math.PI * noiseTime / 0.58) * Math.pow(1 - noiseTime / 0.58, 1.2);
  }
  for (let i = 0; i < 5; i++) {
    const start = i === 0 ? 0.48 : i === 1 ? 0.58 : i === 2 ? 0.61 : i === 3 ? 0.69 : 0.65;
    const length = i === 0 ? 0.65 : i === 1 ? 0.75 : i === 2 ? 1 : i === 3 ? 0.78 : 0.32;
    const t = time - start;
    if (t <= 0 || t >= length) continue;
    const amplitude = i === 0 ? 0.18 : i === 1 ? 0.11 : i === 2 ? 0.06 : i === 3 ? 0.021 : 0.016;
    const frequency = i === 1 ? 220 : i === 2 ? 220 * 2.005 : i === 3 ? 220 * 3.01 : 220 * 4.98;
    const angle = i === 0 ? 2 * Math.PI * 92 * (Math.exp(Math.log(42 / 92) * t / length) - 1) / (Math.log(42 / 92) / length) : 2 * Math.PI * frequency * t;
    const envelope = (1 - Math.exp(-t * 90)) * Math.exp(-t * 7 / length) * Math.min(1, (length - t) / 0.03);
    sample += amplitude * envelope * Math.sin(angle);
  }
  return sample;
}


var artworkPromise;

/** Embedded artwork and font also work for offline native exports. */
function loadBrandOutroArtwork() {
  if (artworkPromise) return artworkPromise;
  const loadImage = (source) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the export artwork"));
    image.src = source;
  });
  const sources = BRAND_OUTRO_SOURCES;
  const font = typeof FontFace === "function" && document.fonts
    ? new FontFace("DeHubOutro", "url(" + sources.font + ")", { weight: "500" }).load().then(face => { document.fonts.add(face); })
    : Promise.resolve();
  artworkPromise = Promise.all([loadImage(sources.mark), loadImage(sources.background), loadImage(sources.globe), loadImage(sources.star), font]).then(([mark, background, globe, star]) => {
    const logo = document.createElement("canvas");
    logo.width = 256;
    logo.height = Math.ceil(256 * 1184 / 908);
    const ctx = logo.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the export icon");
    ctx.drawImage(mark, 502, 236, 908, 1184, 0, 0, logo.width, logo.height);
    ctx.globalCompositeOperation = "source-in";
    const silver = ctx.createLinearGradient(0, 0, 0, logo.height);
    for (const [offset, color] of [[0, "#fcfdff"], [0.22, "#a6abb2"], [0.39, "#f8fbff"], [0.54, "#555b66"], [0.69, "#cdd4de"], [0.9, "#787f8b"], [1, "#e3e8ef"]]) silver.addColorStop(offset, color);
    ctx.fillStyle = silver;
    ctx.fillRect(0, 0, logo.width, logo.height);
    return { logo, background, globe, star };
  }).catch(error => { artworkPromise = undefined; throw error; });
  return artworkPromise;
}
`;
