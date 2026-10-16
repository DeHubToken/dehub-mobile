import type { Clip, ProjectSnapshot } from "./types";
export interface DesignPdfLink { url: string; x: number; y: number; width: number; height: number }

export function designPageLinkIndex(value: string): number | null {
  const match = value.trim().match(/^#page=([1-9]\d{0,2})$/);
  return match && Number(match[1]) <= 500 ? Number(match[1]) - 1 : null;
}
export function remapDesignPageLinks(clips: Clip[], order: readonly number[]): Clip[] {
  return clips.map(clip => {
    const target = clip.href ? designPageLinkIndex(clip.href) : null;
    if (target === null) return clip;
    const index = order.indexOf(target), href = index < 0 ? undefined : `#page=${index + 1}`;
    return href === clip.href ? clip : { ...clip, href };
  });
}

export function normaliseDesignLink(value: string): string | null {
  const text = value.trim();
  if (!text || text.length > 2048 || /[\u0000-\u0020\u007f]/.test(text)) return null;
  if (text.startsWith("#")) return designPageLinkIndex(text) === null ? null : text;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);
    if (!["https:", "http:", "mailto:", "tel:", "sms:"].includes(url.protocol)) return null;
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.hostname) return null;
    return encodeURI(url.href).replace(/%25([\da-f]{2})/gi, "%$1");
  } catch { return null; }
}

export function applyDesignLink(project: ProjectSnapshot, ids: readonly string[], href: string | null): ProjectSnapshot {
  const url = href === null ? undefined : normaliseDesignLink(href);
  if (url === null) return project;
  const chosen = new Set(ids);
  let changed = false;
  const clips = project.clips.map(clip => {
    if (!chosen.has(clip.id) || clip.locked || clip.kind === "audio" || clip.href === url) return clip;
    changed = true; return { ...clip, href: url };
  });
  return changed ? { ...project, clips } : project;
}

/** PDF link rectangles are normalized so changing export resolution does not move them. */
export function designPdfLink(href: string | undefined, box: { cx: number; cy: number; w: number; h: number; rotation: number }, W: number, H: number,
  animation: { scale: number; dx: number; dy: number; rotation?: number; alpha: number }, translateX = 0,
  clipRect?: { x: number; w: number }): DesignPdfLink | null {
  const url = href ? normaliseDesignLink(href) : null;
  if (!url || animation.alpha <= 0.001 || W <= 0 || H <= 0) return null;
  const angle = (box.rotation + (animation.rotation || 0)) * Math.PI / 180;
  const scale = Math.abs(animation.scale), c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
  const hw = (box.w * c + box.h * s) / 2 * scale, hh = (box.h * c + box.w * s) / 2 * scale;
  const cx = W / 2 + (box.cx - W / 2) * animation.scale + animation.dx * W + translateX;
  const cy = H / 2 + (box.cy - H / 2) * animation.scale + animation.dy * H;
  const left = Math.max(0, cx - hw, clipRect?.x ?? 0), top = Math.max(0, cy - hh);
  const right = Math.min(W, cx + hw, clipRect ? clipRect.x + clipRect.w : W), bottom = Math.min(H, cy + hh);
  if (right <= left || bottom <= top) return null;
  return { url, x: left / W, y: top / H, width: (right - left) / W, height: (bottom - top) / H };
}

/** Copy-local destinations follow copied pages while unrelated links keep their targets. */
export function retargetCopiedPageLinks(clips: Clip[], destinations: ReadonlyMap<number, number>): Clip[] {
  return clips.map(clip => {
    const target = clip.href ? designPageLinkIndex(clip.href) : null, destination = target === null ? undefined : destinations.get(target);
    return destination === undefined ? clip : { ...clip, href: `#page=${destination + 1}` };
  });
}
