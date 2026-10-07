/* Text on dark and glass screens needs full contrast. Keep fills, borders,
   semantic colours and disabled opacity independent of the text colour. */
const WHITE = Object.freeze({ color: "#FFFFFF" });
const cache = new WeakMap();
const COOL_NEUTRALS = new Set(["#919ca9", "#6b7280", "#9ca3af", "#94a3b8", "#64748b", "#cbd5e1"]);
let native;

function isMutedNeutral(color) {
  if (typeof color !== "string") return false;
  if (COOL_NEUTRALS.has(color.toLowerCase())) return true;
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color);
  if (hex) {
    const value = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    const rgb = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
    return Math.min(...rgb) >= 70 && Math.max(...rgb) <= 220 && Math.max(...rgb) - Math.min(...rgb) <= 18;
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(color);
  if (!rgba) return false;
  const rgb = rgba.slice(1, 4).map(Number);
  const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
  return alpha >= 0.3 && alpha <= 1 && Math.min(...rgb) >= 70
    && Math.max(...rgb) - Math.min(...rgb) <= 18
    && (Math.max(...rgb) <= 220 || alpha < 0.8);
}

function scan(style, result = {}) {
  if (Array.isArray(style)) style.forEach((part) => scan(part, result));
  else if (style && typeof style === "object") {
    if (style.color !== undefined) result.color = style.color;
    if (style.backgroundColor !== undefined) result.backgroundColor = style.backgroundColor;
  }
  return result;
}

function readableStyle(style) {
  if (!style || typeof style !== "object") return style;
  if (cache.has(style)) return cache.get(style);
  const found = scan(style);
  // A Text that paints its own light fill can legitimately use dark grey ink.
  const lightFill = /^(?:#fff(?:fff)?|#f[\da-f]{5}|white)$/i.test(found.backgroundColor || "");
  const out = !lightFill && isMutedNeutral(found.color) ? [style, WHITE] : style;
  cache.set(style, out);
  return out;
}

const MUTED_CLASS = /(^|\s)text-(?:(?:zinc|gray|neutral|slate)-[3456]00|theme-neutrals-[3456]00|muted-foreground|white\/(?:30|40|50|60|70))(?:\/(?:\d+|\[[^\]]+\]))?(?=\s|$)/g;

function readableTextProps(type, props) {
  if (!type || !props) return props;
  // Lazy import: the JSX runtime is initialized before react-native.
  if (!native) native = require("react-native");
  if (type !== native.Text && type !== native.TextInput) return props;
  if (typeof props.className === "string" && /(?:^|\s)bg-(?:white|(?:zinc|gray|neutral|slate)-[12]00)(?=\s|$)/.test(props.className)) return props;
  const style = readableStyle(props.style);
  const className = typeof props.className === "string" ? props.className.replace(MUTED_CLASS, "$1text-white") : props.className;
  const placeholderTextColor = type === native.TextInput && isMutedNeutral(props.placeholderTextColor)
    ? "#FFFFFF" : props.placeholderTextColor;
  if (style === props.style && className === props.className && placeholderTextColor === props.placeholderTextColor) return props;
  return { ...props, style, className, ...(placeholderTextColor !== props.placeholderTextColor ? { placeholderTextColor } : {}) };
}

module.exports = { readableTextProps };
