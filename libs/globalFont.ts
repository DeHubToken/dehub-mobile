import { Platform, StyleSheet } from "react-native";
import { withPistolEmoji } from "./pistolEmoji";

/**
 * Applies Manrope globally to every Text and TextInput in the app.
 *
 * React Native has no universal selector like CSS `* { font-family }`, so the
 * family has to be injected at render time.
 *
 * **Why this is not a `Text.render` patch any more.** It used to be, and that
 * patch had silently done nothing since the RN 0.81 upgrade: `Text` and
 * `TextInput` are now plain function components (`const TextImpl: component(…) =
 * ({ref, …}) => …`, `Text.js:38`), not `forwardRef` objects, so `Component.render`
 * is `undefined`, the guard tripped, and every screen in the APK rendered in
 * Roboto/SF. The failure was invisible: a `__DEV__`-only console warning, no
 * crash, no red screen.
 *
 * Swapping the component out of `react-native`'s exports instead is *not* an
 * option: `react-native-css-interop` keys its `interopComponents` Map on the
 * component reference (`runtime/native/api.js:37`), so a replacement `Text`
 * would miss the lookup in `wrapJSX` and silently kill `className` on all ~930
 * className'd text nodes.
 *
 * So we intercept where every element in this app already passes through. The
 * babel config sets `jsxImportSource: "nativewind"`, and
 * `nativewind/jsx-runtime` re-exports `react-native-css-interop/jsx-runtime`,
 * whose `jsx`/`jsxs`/`jsxDEV` are plain writable properties. Wrapping them runs
 * *before* NativeWind's interop mapping, so it sees the original `Text` and
 * hands NativeWind an untouched type — className keeps working exactly as it
 * did.
 *
 * React Native does not synthesise weights for a custom family: giving it
 * `fontFamily: "Manrope_400Regular"` + `fontWeight: "700"` renders regular on iOS
 * and fake-bolds on Android. Each weight therefore resolves to its own loaded
 * file, and the injected style pins `fontWeight` to `normal` so the platform
 * never bolts a synthetic weight on top of a face that already carries one.
 *
 * Manrope tops out at ExtraBold (800), so 900 maps there too; weights below
 * 400 stay on Regular to keep the bundle to five TTFs.
 */
const FAMILY_BY_WEIGHT: Record<string, string> = {
  "100": "Manrope_400Regular",
  "200": "Manrope_400Regular",
  "300": "Manrope_400Regular",
  "400": "Manrope_400Regular",
  normal: "Manrope_400Regular",
  "500": "Manrope_500Medium",
  "600": "Manrope_600SemiBold",
  "700": "Manrope_700Bold",
  bold: "Manrope_700Bold",
  "800": "Manrope_800ExtraBold",
  "900": "Manrope_800ExtraBold",
};

const DEFAULT_FAMILY = "Manrope_400Regular";

/** Largest system font scale text honours; see the cap in wrap(). */
const MAX_FONT_SCALE = 1.4;

/**
 * Tailwind weight utilities, for the ~590 nodes that set their weight through
 * `className` rather than `style`. Alternation is longest-first so `font-bold`
 * cannot claim `font-extrabold`.
 */
const CLASS_WEIGHT_RE =
  /(?:^|[\s:])font-(extralight|extrabold|semibold|normal|medium|light|black|thin|bold)(?:$|\s)/;

const CLASS_WEIGHT: Record<string, string> = {
  thin: "100",
  extralight: "200",
  light: "300",
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
  black: "900",
};

/**
 * `font-mono` (23 uses), `font-sans`, `font-serif` — NativeWind resolves these
 * to a family of their own, so leave them alone exactly as an explicit
 * `fontFamily` in a style object is left alone.
 */
const CLASS_FAMILY_RE = /(?:^|[\s:])font-(mono|sans|serif)(?:$|\s)/;

/** One shared style object per family, so its identity is stable across renders. */
const INJECTED: Record<string, { fontFamily: string; fontWeight: "normal" }> = {};

function injectedFor(family: string) {
  let style = INJECTED[family];
  if (!style) {
    style = { fontFamily: family, fontWeight: "normal" };
    INJECTED[family] = style;
  }
  return style;
}

type TextStyleish = { fontFamily?: string; fontWeight?: string | number };

function fontStyleFor(style: unknown, className: unknown) {
  let flat: TextStyleish;
  try {
    // Cheap path: no style at all is the common case for className'd nodes.
    flat = style == null ? {} : ((StyleSheet.flatten(style as never) || {}) as TextStyleish);
  } catch {
    // Animated/shared-value styles that flatten cannot read — leave them be.
    return null;
  }

  // Respect any node that deliberately picks its own family (icon fonts,
  // monospace) — overriding those would break glyph rendering.
  if (flat.fontFamily) return null;
  if (typeof className === "string" && CLASS_FAMILY_RE.test(className)) return null;

  let weight = flat.fontWeight != null ? String(flat.fontWeight) : null;
  if (weight == null && typeof className === "string") {
    const match = CLASS_WEIGHT_RE.exec(className);
    if (match) weight = CLASS_WEIGHT[match[1]];
  }

  return injectedFor(FAMILY_BY_WEIGHT[weight ?? "400"] || DEFAULT_FAMILY);
}

/**
 * Manrope's tallest ascent plus its deepest descender (g, 0.255em), as a share
 * of the font size. Android keeps the full ascent when a lineHeight is tighter
 * than the font and cuts the descent, and the Text view clips to that line
 * box, so a 14pt @handle on a 16pt line lost the tails of g, j, p and y.
 */
const MANROPE_INK_HEIGHT = (2132 + 510) / 2000;

type ClipStyleish = {
  fontSize?: number;
  lineHeight?: number;
  height?: unknown;
  maxHeight?: unknown;
  padding?: unknown;
  paddingVertical?: unknown;
  paddingBottom?: unknown;
  marginBottom?: unknown;
  margin?: unknown;
  marginVertical?: unknown;
  backgroundColor?: unknown;
  borderWidth?: unknown;
  borderBottomWidth?: unknown;
};

/**
 * Room for descenders below a tight line: extra bottom padding that the same
 * negative bottom margin takes back, so the row lays out exactly as before
 * but the view's box (its clip) reaches the bottom of the g. Only for plain
 * text: a node with its own box (background, border, fixed height, padding
 * or bottom margin) is left as it is.
 */
const OWN_BOX_CLASS_RE = /(?:^|[\s:])(?:-?(?:p|py|pb|m|my|mb)-|h-|max-h-|bg-|border)/;

function descenderRoomFor(style: unknown, className: unknown) {
  if (Platform.OS === "web" || style == null) return null;
  if (typeof className === "string" && OWN_BOX_CLASS_RE.test(className)) return null;
  let flat: ClipStyleish;
  try {
    flat = (StyleSheet.flatten(style as never) || {}) as ClipStyleish;
  } catch {
    return null;
  }
  const { fontSize, lineHeight } = flat;
  if (typeof fontSize !== "number" || typeof lineHeight !== "number") return null;
  const room = Math.ceil(fontSize * MANROPE_INK_HEIGHT - lineHeight);
  if (room <= 0) return null;
  if (
    flat.height != null || flat.maxHeight != null || flat.padding != null || flat.paddingVertical != null ||
    flat.paddingBottom != null || flat.marginBottom != null || flat.margin != null || flat.marginVertical != null ||
    flat.backgroundColor != null || flat.borderWidth != null || flat.borderBottomWidth != null
  ) {
    return null;
  }
  return { paddingBottom: room, marginBottom: -room };
}

/**
 * The element types worth patching. Resolved on the first JSX call rather than
 * at install time so that requiring this module from `index.ts` — which runs
 * before most of the app's dependency graph — cannot reorder anyone's imports.
 */
let textTypes: Set<unknown> | null = null;

/** The input subset of textTypes — they cannot hold inline images. */
let inputTypes: Set<unknown> | null = null;

function resolveTextTypes(): Set<unknown> {
  const types = new Set<unknown>();
  try {
    const RN = require("react-native");
    types.add(RN.Text);
    types.add(RN.TextInput);
    types.add(RN.Animated?.Text);
    types.add(RN.Animated?.TextInput);
  } catch {
    /* nothing to patch */
  }
  try {
    const reanimated = require("react-native-reanimated");
    const Animated = reanimated?.default ?? reanimated;
    types.add(Animated?.Text);
    types.add(Animated?.TextInput);
  } catch {
    /* reanimated is optional here */
  }
  types.delete(undefined);
  types.delete(null);
  return types;
}

function resolveInputTypes(): Set<unknown> {
  const types = new Set<unknown>();
  try {
    const RN = require("react-native");
    types.add(RN.TextInput);
    types.add(RN.Animated?.TextInput);
  } catch {
    /* nothing to exclude */
  }
  try {
    const reanimated = require("react-native-reanimated");
    types.add((reanimated?.default ?? reanimated)?.TextInput);
  } catch {
    /* reanimated is optional here */
  }
  return types;
}

function wrap(jsx: any) {
  if (typeof jsx !== "function") return jsx;
  return function fontJsx(type: unknown, props: any, ...rest: unknown[]) {
    if (textTypes === null) textTypes = resolveTextTypes();
    if (inputTypes === null) inputTypes = resolveInputTypes();
    if (props && textTypes.has(type)) {
      const injected = fontStyleFor(props.style, props.className);
      // Appended, not prepended: it has to outrank whatever NativeWind derives
      // from `className`, which is the only other thing setting a weight here.
      if (injected) props = { ...props, style: [props.style, injected] };
      if (injected && !inputTypes.has(type)) {
        const room = descenderRoomFor(props.style, props.className);
        if (room) props = { ...props, style: [props.style, room] };
      }
      // Cap how far the system font size can blow text up. Past ~1.4x the
      // fixed-height pills, badges and buttons clip their labels; below it the
      // setting still does its job. A node that sets its own cap keeps it.
      if (props.maxFontSizeMultiplier == null) {
        props = { ...props, maxFontSizeMultiplier: MAX_FONT_SCALE };
      }
      if (!inputTypes.has(type)) props = withPistolEmoji(props);
    }
    return jsx(type, props, ...rest);
  };
}

/**
 * `nativewind/*` covers this app's own JSX (babel rewrites it there via
 * `jsxImportSource`); `react/*` covers text rendered by dependencies — toasts,
 * navigation chrome — which compile against React's runtime and would
 * otherwise be the only Roboto left in the APK.
 *
 * Patching both cannot double-inject. NativeWind swaps `Text` for its interop
 * component before delegating, so by the time React's runtime sees the element
 * the type no longer matches `textTypes`; and even if it did, the style it
 * would be re-reading already carries a `fontFamily`, which is the bail case.
 *
 * The specifiers are literals inside thunks rather than an array of strings:
 * Metro resolves `require()` statically, so `require(someVariable)` is not a
 * late binding, it is an unresolvable module at bundle time.
 */
const RUNTIMES: Array<[string, () => any]> = [
  ["nativewind/jsx-runtime", () => require("nativewind/jsx-runtime")],
  ["nativewind/jsx-dev-runtime", () => require("nativewind/jsx-dev-runtime")],
  ["react/jsx-runtime", () => require("react/jsx-runtime")],
  ["react/jsx-dev-runtime", () => require("react/jsx-dev-runtime")],
];

let applied = false;

/**
 * Call once, as early as possible — `index.ts` imports this module for its side
 * effect before `App`. Idempotent, and a no-op against any runtime that stops
 * exposing writable `jsx` exports, so an upgrade degrades to the system font
 * instead of taking boot down with it.
 */
export function applyGlobalFont() {
  if (applied) return;
  applied = true;
  for (const [specifier, load] of RUNTIMES) {
    try {
      const runtime = load();
      for (const key of ["jsx", "jsxs", "jsxDEV"] as const) {
        if (typeof runtime[key] === "function") runtime[key] = wrap(runtime[key]);
      }
    } catch (error) {
      if (__DEV__) console.warn(`[globalFont] could not patch ${specifier}`, error);
    }
  }
}

applyGlobalFont();
