/**
 * Minimal theme shape pass. Web squares everything off with one rule
 * (`html[data-theme="minimal"] * { border-radius: 0 }`); React Native has no
 * cascade, and ~900 radii here are written inline in StyleSheets that never
 * see the theme. So every element's `style` is checked on its way through the
 * JSX runtime (./jsx-runtime.js) and, only while minimal is on, any corner
 * radius is overridden to 0. With the flag off this is one boolean read.
 *
 * The same pass takes the app's near-blacks to true black: ~45 screens and
 * sheets paint their own `#010305` / `#0C0C0E`-style backgrounds inline,
 * and minimal is a pure black canvas. Only these near-black page colours
 * move; every other fill (buttons, chips, media wells) is left alone.
 *
 * Plain JS on purpose: the JSX runtime loads before anything else in the app.
 */
const RADIUS_KEYS = [
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "borderTopStartRadius",
  "borderTopEndRadius",
  "borderBottomStartRadius",
  "borderBottomEndRadius",
  "borderStartStartRadius",
  "borderStartEndRadius",
  "borderEndStartRadius",
  "borderEndEndRadius",
];

const SQUARE = Object.freeze(
  RADIUS_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {}),
);

// Page and sheet backgrounds that are "black" in the system theme.
const NEAR_BLACK = new Set(["#010305", "#0c0c0e", "#09090b", "#0a0a0a", "#050505"]);

const BLACK = Object.freeze({ backgroundColor: "#000" });
let SQUARE_BLACK;

let squaring = false;

function setSquaring(on) {
  squaring = !!on;
}

function isSquaring() {
  return squaring;
}

// Walks a style (object or nested array, later entries winning) and reports
// whether any corner is rounded and what the effective background is.
function scan(style, acc) {
  if (!style) return acc;
  if (Array.isArray(style)) {
    for (let i = 0; i < style.length; i++) scan(style[i], acc);
    return acc;
  }
  if (typeof style !== "object") return acc;
  if (!acc.radius) {
    for (let i = 0; i < RADIUS_KEYS.length; i++) {
      const v = style[RADIUS_KEYS[i]];
      if (v !== undefined && v !== 0) {
        acc.radius = true;
        break;
      }
    }
  }
  if (style.backgroundColor !== undefined) acc.bg = style.backgroundColor;
  return acc;
}

function overrideFor(style) {
  const found = scan(style, { radius: false, bg: undefined });
  const nearBlack = typeof found.bg === "string" && NEAR_BLACK.has(found.bg.toLowerCase());
  if (!found.radius && !nearBlack) return null;
  if (!nearBlack) return SQUARE;
  return found.radius ? SQUARE_BLACK : BLACK;
}

// Same input object, same output array: a memoised child keeps seeing an
// identical style prop across renders instead of a fresh array every time.
const cache = new WeakMap();

function squareStyle(style) {
  if (!style || typeof style !== "object") return style;
  if (!Array.isArray(style)) {
    const hit = cache.get(style);
    if (hit !== undefined) return hit;
    const override = overrideFor(style);
    const out = override ? [style, override] : style;
    cache.set(style, out);
    return out;
  }
  const override = overrideFor(style);
  return override ? [style, override] : style;
}

/** Props with any radius in `style` / `imageStyle` squared off, or the same props. */
function squareProps(props) {
  if (!squaring || !props || typeof props !== "object") return props;
  const style = props.style !== undefined ? squareStyle(props.style) : undefined;
  const imageStyle = props.imageStyle !== undefined ? squareStyle(props.imageStyle) : undefined;
  if (style === props.style && imageStyle === props.imageStyle) return props;
  const next = { ...props };
  if (style !== undefined) next.style = style;
  if (imageStyle !== undefined) next.imageStyle = imageStyle;
  return next;
}

SQUARE_BLACK = Object.freeze({ ...SQUARE, backgroundColor: "#000" });

module.exports = { setSquaring, isSquaring, squareStyle, squareProps, SQUARE };
