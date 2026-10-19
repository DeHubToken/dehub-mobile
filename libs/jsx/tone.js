/**
 * System Light's colour pass. The app is written dark: ~540 inline whites,
 * near-black page fills and white hairlines, plus the palette in
 * theme/colors.ts. Class names flip at the root (SYSTEM_LIGHT_ROOT_VARS); this
 * does the same for inline colours on their way through the JSX runtime, so
 * every screen reads ink on white without being rewritten.
 *
 * Only greys move (black, white and anything with near-equal channels), and
 * they move to their opposite: white text becomes ink, a #18181B card becomes
 * a pale grey, a white button becomes ink and its dark label white. Brand and
 * status colours are left alone, as are pure black fills (media wells) and
 * black scrims, which sit over pictures.
 *
 * Media, camera and live surfaces stay dark (`dark-surface`, as in
 * global.css), and so does text with a shadow, which is drawn over a picture.
 * Whether an element sits inside one of those is only known where it renders,
 * so an element with colours to change renders through ToneFill, which reads
 * that from its real place in the tree. With System Light off the whole pass
 * is one boolean read.
 *
 * Plain JS for the same reason as ./shape.js.
 */
const React = require("react");

let on = false;
let cache = new WeakMap();
let base;

function jsxAny(type, props) {
  if (!base) base = require("nativewind/jsx-runtime");
  return Array.isArray(props.children) ? base.jsxs(type, props) : base.jsx(type, props);
}

const KeepDark = React.createContext(false);

function setLightTone(next) {
  const v = !!next;
  if (v === on) return;
  on = v;
  cache = new WeakMap();
}

function isLightToneOn() {
  return on;
}

const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1] };

function parse(color) {
  if (typeof color !== "string") return null;
  const value = color.trim().toLowerCase();
  if (NAMED[value]) return NAMED[value];
  let m = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.exec(value);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split("").map((c) => c + c).join("");
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
  }
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/.exec(value);
  if (m) {
    let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : Number(m[4]);
    if (!Number.isFinite(a)) a = 1;
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  return null;
}

function grey(rgba) {
  return Math.max(rgba[0], rgba[1], rgba[2]) - Math.min(rgba[0], rgba[1], rgba[2]) <= 14;
}

/**
 * Written as `hsla()` on purpose: nothing in the app writes a grey that way,
 * so a colour this pass produced is never turned around a second time when a
 * component hands it on to a child (an icon's `color` reaching its strokes).
 */
function format(lum, a) {
  const l = Math.round((Math.max(0, Math.min(255, 266 - lum)) / 255) * 1000) / 10;
  return `hsla(0,0%,${l}%,${Math.round(a * 1000) / 1000})`;
}

/**
 * The light colour for a dark-theme colour, or the same string. `fill`: a
 * background, where pure black (media wells) and see-through blacks (scrims
 * over pictures) stay as they are.
 */
function toneColor(color, fill) {
  const rgba = parse(color);
  if (!rgba || !grey(rgba) || rgba[3] === 0) return color;
  const lum = (rgba[0] + rgba[1] + rgba[2]) / 3;
  if (fill && lum <= 2) return color;
  return format(lum, rgba[3]);
}

const TEXT_KEYS = ["color", "tintColor", "textDecorationColor"];
const BORDER_KEYS = [
  "borderColor", "borderTopColor", "borderBottomColor", "borderLeftColor", "borderRightColor",
  "borderStartColor", "borderEndColor", "borderBlockColor", "borderBlockStartColor", "borderBlockEndColor",
  "outlineColor",
];

function toneObject(style) {
  if (cache.has(style)) return cache.get(style);
  let out = null;
  if (style.textShadowColor === undefined || style.textShadowRadius === 0) {
    for (let i = 0; i < TEXT_KEYS.length; i++) {
      const k = TEXT_KEYS[i];
      const v = style[k];
      if (v === undefined) continue;
      const next = toneColor(v, false);
      if (next !== v) (out || (out = {}))[k] = next;
    }
  }
  for (let i = 0; i < BORDER_KEYS.length; i++) {
    const k = BORDER_KEYS[i];
    const v = style[k];
    if (v === undefined) continue;
    const next = toneColor(v, false);
    if (next !== v) (out || (out = {}))[k] = next;
  }
  if (style.backgroundColor !== undefined) {
    const next = toneColor(style.backgroundColor, true);
    if (next !== style.backgroundColor) (out || (out = {}))["backgroundColor"] = next;
  }
  const result = out ? [style, out] : style;
  cache.set(style, result);
  return result;
}

function toneStyle(style) {
  if (typeof style === "function") return (state) => toneStyle(style(state));
  if (!style || typeof style !== "object") return style;
  if (!Array.isArray(style)) return toneObject(style);
  let changed = false;
  const next = style.map((part) => {
    const t = toneStyle(part);
    if (t !== part) changed = true;
    return t;
  });
  return changed ? next : style;
}

const STYLE_PROPS = ["contentContainerStyle", "imageStyle", "containerStyle", "textStyle", "columnWrapperStyle", "selectedStyle"];
const PROP_TEXT = ["color", "tintColor", "placeholderTextColor", "selectionColor", "cursorColor", "stroke", "iconColor", "activeColor", "inactiveColor"];
const PROP_FILL = ["backgroundColor", "fill", "thumbColor", "underlayColor"];

/** The props with every grey turned around, or the same props. */
function toneProps(props) {
  let next = null;
  const style = props.style !== undefined ? toneStyle(props.style) : undefined;
  if (style !== props.style) (next || (next = { ...props })).style = style;
  for (let i = 0; i < STYLE_PROPS.length; i++) {
    const key = STYLE_PROPS[i];
    if (props[key] === undefined) continue;
    const s = toneStyle(props[key]);
    if (s !== props[key]) (next || (next = { ...props }))[key] = s;
  }
  for (let i = 0; i < PROP_TEXT.length; i++) {
    const k = PROP_TEXT[i];
    if (typeof props[k] !== "string") continue;
    const v = toneColor(props[k], false);
    if (v !== props[k]) (next || (next = { ...props }))[k] = v;
  }
  for (let i = 0; i < PROP_FILL.length; i++) {
    const k = PROP_FILL[i];
    if (typeof props[k] !== "string") continue;
    const v = toneColor(props[k], true);
    if (v !== props[k]) (next || (next = { ...props }))[k] = v;
  }
  if (Array.isArray(props.colors) && props.colors.every((c) => typeof c === "string")) {
    const colors = props.colors.map((c) => toneColor(c, true));
    if (colors.some((c, i) => c !== props.colors[i])) (next || (next = { ...props })).colors = colors;
  }
  if (props.trackColor && typeof props.trackColor === "object") {
    const t = props.trackColor;
    const trackColor = { false: toneColor(t.false, true), true: toneColor(t.true, true) };
    if (trackColor.false !== t.false || trackColor.true !== t.true) (next || (next = { ...props })).trackColor = trackColor;
  }
  if (props.tint === "dark") (next || (next = { ...props })).tint = "light";
  else if (typeof props.tint === "string") {
    const v = toneColor(props.tint, false);
    if (v !== props.tint) (next || (next = { ...props })).tint = v;
  }
  if (props.keyboardAppearance === "dark") (next || (next = { ...props })).keyboardAppearance = "light";
  return next || props;
}

const DARK_SURFACE = /(?:^|\s)dark-surface(?=\s|$)/;

const ToneFill = React.forwardRef(function ToneFill(props, ref) {
  const { __toneType: type, __toned: _toned, ...rest } = props;
  const dark = React.useContext(KeepDark);
  // Toned from the props as they arrive here, not as they were when the
  // element was made: a parent can clone in more (ScrollView hands its
  // refreshControl a `style`), and the earlier copy would drop them.
  const chosen = dark ? rest : toneProps(rest);
  return jsxAny(type, ref ? { ...chosen, ref } : chosen);
});

// Picture types. Read lazily: the JSX runtime loads before any of them.
let mediaTypes;
function isMediaType(type) {
  if (!mediaTypes) {
    mediaTypes = new Set();
    const add = (load) => {
      try {
        const t = load();
        if (t) mediaTypes.add(t);
      } catch (_) {
        // Not in this build or test.
      }
    };
    add(() => require("react-native").Image);
    add(() => require("react-native").ImageBackground);
    add(() => require("expo-image").Image);
    add(() => require("expo-video").VideoView);
    // The app's own wrappers around those two.
    add(() => require("../../components/common/SmartImage").SmartImage);
    add(() => require("../../components/common/PersistentVideoView").PersistentVideoView);
  }
  return mediaTypes.has(type);
}

function flat(style) {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return style && typeof style === "object" ? style : {};
}

function fills(style) {
  const f = flat(style);
  if (f.position === "absolute") return f.top === 0 && f.bottom === 0 && (f.left === 0 || f.right === 0 || f.width === "100%");
  return f.width === "100%" && f.height === "100%";
}

/**
 * A frame whose picture fills it edge to edge: everything else in it is drawn
 * over the picture (a short's name and counts, a video's play button), so it
 * keeps its white-on-picture colours.
 */
function isMediaFrame(type, props) {
  if (isMediaType(type)) return type !== require("react-native").Image && props.children != null;
  const children = props.children;
  if (!Array.isArray(children)) return false;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child || typeof child !== "object" || !child.props) continue;
    const t = child.type === ToneFill ? child.props.__toneType : child.type;
    if (isMediaType(t) && fills(child.props.style)) return true;
  }
  return false;
}

/** The type and props an element is created with while System Light is on. */
function tone(type, props) {
  if (!on || !props || typeof props !== "object" || type === ToneFill) return [type, props];
  if (typeof props.className === "string" && DARK_SURFACE.test(props.className)) {
    return [type, { ...props, children: jsxAny(KeepDark.Provider, { value: true, children: props.children }) }];
  }
  if (isMediaFrame(type, props)) {
    props = { ...props, children: jsxAny(KeepDark.Provider, { value: true, children: props.children }) };
    // Class colours too (`text-white` over the picture), as `dark-surface`
    // does. Not on a style function: NativeWind would drop that style.
    if (typeof props.style !== "function") {
      props.className = typeof props.className === "string" ? `${props.className} dark-surface` : "dark-surface";
    }
  }
  const toned = toneProps(props);
  if (toned === props) return [type, props];
  const { children, ...rest } = toned;
  return [ToneFill, { ...props, __toneType: type, __toned: rest }];
}

/** Puts a subtree back on the dark colours, for media drawn without `dark-surface`. */
function KeepDarkScope({ children }) {
  return jsxAny(KeepDark.Provider, { value: true, children });
}

module.exports = { setLightTone, isLightToneOn, tone, toneColor, KeepDark, KeepDarkScope, ToneFill };
