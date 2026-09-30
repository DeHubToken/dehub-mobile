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
// near-blacks, and the NativeWind page classes, for a see-through veil of their
// page colour so the live backdrop shows behind every screen; War squares as
// well. System does nothing, and then the whole pass is one boolean read.
let square = false;
let page = null;
let classes = false;
let active = false;
let PAGE = null;
let SQUARE_PAGE = null;
// What those fills become on a surface that floats over the page instead of
// being it: a modal, sheet, drawer or pinned bar. Only a see-through page
// shows the backdrop; a see-through sheet shows the screen under it, so a
// surface always takes the solid page colour. Same as `page` unless a canvas
// theme veils its pages.
let surface = null;
let SURFACE = null;
let SQUARE_SURFACE = null;

// The NativeWind page fills. Their colour comes from a root variable with no
// alpha, so a see-through page (a canvas theme's veil) is laid over them as an
// inline style, which NativeWind lets win over the class. Opacity variants
// (`bg-theme-neutrals-900/60`) are already see-through and left alone.
const PAGE_CLASS = /(?:^|\s)(?:bg-theme-neutrals-900|bg-theme-background|bg-zinc-950)(?=\s|$)/;

// Pinned bars and overlays position themselves absolutely; a page does not.
const ABSOLUTE_CLASS = /(?:^|\s)absolute(?=\s|$)/;

/**
 * Configure the pass: square corners, and/or the colour near-black page fills
 * become. With `nextClasses`, the NativeWind page classes take that colour too.
 * `nextSurface` is the solid colour the same fills take on a floating surface
 * (defaults to `nextPage`).
 */
function setThemePass(nextSquare, nextPage, nextClasses, nextSurface) {
  const s = !!nextSquare;
  const p = typeof nextPage === "string" && nextPage ? nextPage : null;
  const c = !!nextClasses && p !== null;
  const f = p === null ? null : typeof nextSurface === "string" && nextSurface ? nextSurface : p;
  if (s === square && p === page && c === classes && f === surface) return;
  square = s;
  page = p;
  classes = c;
  surface = f;
  active = square || page !== null;
  PAGE = page ? Object.freeze({ backgroundColor: page }) : null;
  SQUARE_PAGE = page ? Object.freeze({ ...SQUARE, backgroundColor: page }) : null;
  SURFACE = surface ? Object.freeze({ backgroundColor: surface }) : null;
  SQUARE_SURFACE = surface ? Object.freeze({ ...SQUARE, backgroundColor: surface }) : null;
  // Results depend on the pass, so a theme switch starts a fresh cache.
  cache = new WeakMap();
  classCache = new WeakMap();
  solidCache = new WeakMap();
  solidClassCache = new WeakMap();
}

/** Whether pages and surfaces take different fills, so where an element sits matters. */
function isVeiled() {
  return classes && surface !== page;
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
  if (style.position !== undefined) acc.absolute = style.position === "absolute";
  return acc;
}

function isNearBlack(bg) {
  return typeof bg === "string" && NEAR_BLACK.has(bg.toLowerCase());
}

function overrideFor(style, solid) {
  const found = scan(style, { radius: false, bg: undefined, absolute: false });
  const rounded = square && found.radius;
  const nearBlack = page !== null && isNearBlack(found.bg);
  if (!rounded && !nearBlack) return null;
  if (!nearBlack) return SQUARE;
  if (solid || found.absolute) return rounded ? SQUARE_SURFACE : SURFACE;
  return rounded ? SQUARE_PAGE : PAGE;
}

// Same input object, same output array: a memoised child keeps seeing an
// identical style prop across renders instead of a fresh array every time.
let cache = new WeakMap();
let solidCache = new WeakMap();

function squareStyle(style, solid) {
  // Pressable's `({ pressed }) => style`: square whatever it returns.
  if (typeof style === "function") return (state) => squareStyle(style(state), solid);
  if (!style || typeof style !== "object") return style;
  if (!Array.isArray(style)) {
    const memo = solid ? solidCache : cache;
    const hit = memo.get(style);
    if (hit !== undefined) return hit;
    const override = overrideFor(style, solid);
    const out = override ? [style, override] : style;
    memo.set(style, out);
    return out;
  }
  const override = overrideFor(style, solid);
  return override ? [style, override] : style;
}

// Same idea for class-painted pages: one output per input style object.
let classCache = new WeakMap();
let solidClassCache = new WeakMap();

/** `style` with the page colour laid over a page class, unless it sets its own background. */
function classPageStyle(style, solid) {
  const fill = solid ? SURFACE : PAGE;
  if (style === undefined || style === null) return fill;
  if (typeof style !== "object") return style;
  const memo = solid ? solidClassCache : classCache;
  const hit = memo.get(style);
  if (hit !== undefined) return hit;
  const out = scan(style, { radius: false, bg: undefined, absolute: false }).bg === undefined ? [style, fill] : style;
  memo.set(style, out);
  return out;
}

function hasPageClass(props) {
  return classes && typeof props.className === "string" && typeof props.style !== "function" && PAGE_CLASS.test(props.className);
}

/**
 * Whether these props paint a page fill that a canvas theme veils, and so
 * render differently on a page and on a floating surface. Only asked while
 * isVeiled(). A fill that positions itself absolutely is a pinned bar or an
 * overlay, never the page, and is settled here as solid.
 */
function isPageFill(props) {
  if (!props || typeof props !== "object" || typeof props.style === "function") return false;
  const classed = hasPageClass(props);
  const found = props.style ? scan(props.style, { radius: false, bg: undefined, absolute: false }) : null;
  if (found && found.absolute) return false;
  if (classed && ABSOLUTE_CLASS.test(props.className)) return false;
  return classed || (found !== null && isNearBlack(found.bg));
}

/**
 * Props with any radius in `style` / `imageStyle` squared off, or the same
 * props. `solid`: the element sits on a floating surface (see `surface`).
 */
function squareProps(props, solid) {
  if (!active || !props || typeof props !== "object") return props;
  if (hasPageClass(props)) {
    const pinned = ABSOLUTE_CLASS.test(props.className)
      || (!!props.style && scan(props.style, { radius: false, bg: undefined, absolute: false }).absolute);
    props = { ...props, style: classPageStyle(props.style, solid || pinned) };
  }
  const style = props.style !== undefined ? squareStyle(props.style, solid) : undefined;
  const imageStyle = props.imageStyle !== undefined ? squareStyle(props.imageStyle, solid) : undefined;
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

module.exports = { setSquaring, setThemePass, isSquaring, isVeiled, isPageFill, squareStyle, squareProps, routeProps, SQUARE };
