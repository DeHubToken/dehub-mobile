import { StyleSheet, Text, TextInput } from "react-native";

/**
 * Applies Exo globally, matching the web app.
 *
 * The web forces one line of CSS — `* { font-family: Exo, sans-serif }`
 * (dehubweb/src/index.css:46) — but React Native has no universal selector, and
 * `Text.defaultProps` no longer works on RN 0.81 (React 19 removed defaultProps
 * for function components). So the family has to be injected at render time.
 *
 * React Native also does NOT synthesise weights for a custom family: giving it
 * `fontFamily: "Exo_400Regular"` + `fontWeight: "700"` renders regular, not
 * bold. Each weight must resolve to its own loaded font file, which is what the
 * map below does.
 *
 * Weights 800/900 intentionally fall back to Bold rather than shipping two more
 * TTFs — the app's own type scale only uses 400/500/600/700 (font-medium 199x,
 * font-semibold 304x, font-bold 140x).
 */
const FAMILY_BY_WEIGHT: Record<string, string> = {
  "100": "Exo_400Regular",
  "200": "Exo_400Regular",
  "300": "Exo_400Regular",
  "400": "Exo_400Regular",
  normal: "Exo_400Regular",
  "500": "Exo_500Medium",
  "600": "Exo_600SemiBold",
  "700": "Exo_700Bold",
  bold: "Exo_700Bold",
  "800": "Exo_700Bold",
  "900": "Exo_700Bold",
};

const DEFAULT_FAMILY = "Exo_400Regular";

function exoStyleFor(style: unknown) {
  const flat = (StyleSheet.flatten(style as never) || {}) as {
    fontFamily?: string;
    fontWeight?: string | number;
  };
  // Respect any component that deliberately sets its own family (icon fonts,
  // monospace) — overriding those would break glyph rendering.
  if (flat.fontFamily) return null;
  const weight = flat.fontWeight != null ? String(flat.fontWeight) : "400";
  return { fontFamily: FAMILY_BY_WEIGHT[weight] || DEFAULT_FAMILY };
}

function patch(Component: any, label: string) {
  if (!Component || Component.__exoPatched) return;
  const original = Component.render;
  // Guarded: if a future RN version changes Text's internals, no-op rather
  // than crash the app on boot.
  if (typeof original !== "function") {
    if (__DEV__) console.warn(`[globalFont] could not patch ${label}`);
    return;
  }
  Component.render = function patchedRender(...args: any[]) {
    const element = original.apply(this, args);
    if (!element || !element.props) return element;
    const injected = exoStyleFor(element.props.style);
    if (!injected) return element;
    // Injected first so any explicit style on the element still wins.
    return { ...element, props: { ...element.props, style: [injected, element.props.style] } };
  };
  Component.__exoPatched = true;
}

let applied = false;

/** Call once, after the Exo fonts have finished loading. */
export function applyGlobalFont() {
  if (applied) return;
  patch(Text, "Text");
  patch(TextInput, "TextInput");
  applied = true;
}
