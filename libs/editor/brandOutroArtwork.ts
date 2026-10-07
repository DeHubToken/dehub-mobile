import type { BrandOutroArtwork } from "./brandOutro";
import { BRAND_OUTRO_SOURCES } from "./brandOutroSources";

let artworkPromise: Promise<BrandOutroArtwork> | undefined;

/** Embedded artwork and font also work for offline native exports. */
export function loadBrandOutroArtwork(): Promise<BrandOutroArtwork> {
  if (artworkPromise) return artworkPromise;
  const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
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
    for (const [offset, color] of [[0, "#fcfdff"], [0.22, "#a6abb2"], [0.39, "#f8fbff"], [0.54, "#555b66"], [0.69, "#cdd4de"], [0.9, "#787f8b"], [1, "#e3e8ef"]] as const) silver.addColorStop(offset, color);
    ctx.fillStyle = silver;
    ctx.fillRect(0, 0, logo.width, logo.height);
    return { logo, background, globe, star };
  }).catch(error => { artworkPromise = undefined; throw error; });
  return artworkPromise;
}
