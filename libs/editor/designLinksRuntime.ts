export const DESIGN_LINKS_RUNTIME = String.raw`
function normaliseDesignLink(value) {
  const text = value.trim();
  if (!text || text.length > 2048 || /[\u0000-\u0020\u007f]/.test(text)) return null;
  if (text.startsWith("#")) return /^#page=([1-9]\d{0,2})$/.test(text) && Number(text.slice(6)) <= 500 ? text : null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : "https://" + text);
    if (!["https:", "http:", "mailto:", "tel:", "sms:"].includes(url.protocol)) return null;
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.hostname) return null;
    return encodeURI(url.href).replace(/%25([\da-f]{2})/gi, "%$1");
  } catch { return null; }
}

/** PDF link rectangles are normalized so changing export resolution does not move them. */
function designPdfLink(href, box, W, H, animation, translateX = 0, clipRect) {
  const url = href ? normaliseDesignLink(href) : null;
  if (!url || animation.alpha <= 0.001 || W <= 0 || H <= 0) return null;
  const angle = (box.rotation + (animation.rotation || 0)) * Math.PI / 180;
  const scale = Math.abs(animation.scale), c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
  const hw = (box.w * c + box.h * s) / 2 * scale, hh = (box.h * c + box.w * s) / 2 * scale;
  const cx = W / 2 + (box.cx - W / 2) * animation.scale + animation.dx * W + translateX;
  const cy = H / 2 + (box.cy - H / 2) * animation.scale + animation.dy * H;
  const left = Math.max(0, cx - hw, clipRect ? clipRect.x : 0), top = Math.max(0, cy - hh);
  const right = Math.min(W, cx + hw, clipRect ? clipRect.x + clipRect.w : W), bottom = Math.min(H, cy + hh);
  if (right <= left || bottom <= top) return null;
  return { url, x: left / W, y: top / H, width: (right - left) / W, height: (bottom - top) / H };
}
`;
