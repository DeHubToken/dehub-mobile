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

// What the pass does for the active theme. Minimal squares every corner and
// takes near-blacks to #000; the canvas themes (theme/skins.ts) swap those
// near-blacks for their own page colour, and War squares as well. System does
// nothing, and then the whole pass is one boolean read.
let square = false;
let page = null;
let active = false;
let PAGE = null;
let SQUARE_PAGE = null;

/** Configure the pass: square corners, and/or the colour near-black page fills become. */
function setThemePass(nextSquare, nextPage) {
  const s = !!nextSquare;
  const p = typeof nextPage === "string" && nextPage ? nextPage : null;
  if (s === square && p === page) return;
  square = s;
  page = p;
  active = square || page !== null;
  PAGE = page ? Object.freeze({ backgroundColor: page }) : null;
  SQUARE_PAGE = page ? Object.freeze({ ...SQUARE, backgroundColor: page }) : null;
  // Results depend on the pass, so a theme switch starts a fresh cache.
  cache = new WeakMap();
}

/** Minimal's pass on or off. Kept for the callers that predate the other themes. */
function setSquaring(on) {
  setThemePass(!!on, on ? "#000" : null);
}

function isSquaring() {
  return square;
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
  const rounded = square && found.radius;
  const nearBlack = page !== null && typeof found.bg === "string" && NEAR_BLACK.has(found.bg.toLowerCase());
  if (!rounded && !nearBlack) return null;
  if (!nearBlack) return SQUARE;
  return rounded ? SQUARE_PAGE : PAGE;
}

// Same input object, same output array: a memoised child keeps seeing an
// identical style prop across renders instead of a fresh array every time.
let cache = new WeakMap();

function squareStyle(style) {
  // Pressable's `({ pressed }) => style`: square whatever it returns.
  if (typeof style === "function") return (state) => squareStyle(style(state));
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
  if (!active || !props || typeof props !== "object") return props;
  const style = props.style !== undefined ? squareStyle(props.style) : undefined;
  const imageStyle = props.imageStyle !== undefined ? squareStyle(props.imageStyle) : undefined;
  if (style === props.style && imageStyle === props.imageStyle) return props;
  const next = { ...props };
  if (style !== undefined) next.style = style;
  if (imageStyle !== undefined) next.imageStyle = imageStyle;
  return next;
}

/**
 * Keeps Pressable's `style={({ pressed }) => ...}` working. NativeWind's
 * runtime (react-native-css-interop) rebuilds `style` from the objects it can
 * read, and a function reads as an empty object, so the element rendered with
 * no style at all: no size, padding, radius or background. With no className
 * there is nothing for it to translate, so those elements go around it.
 */
function routeProps(props) {
  if (!props || typeof props !== "object" || typeof props.style !== "function") return props;
  if (props.className !== undefined || props.cssInterop !== undefined) return props;
  return { ...props, cssInterop: false };
}

module.exports = { setSquaring, setThemePass, isSquaring, squareStyle, squareProps, routeProps, SQUARE };
