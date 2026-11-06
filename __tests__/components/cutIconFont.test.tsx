/**
 * The cut icons' font (assets/fonts/cut-icons.ttf) is built from the same
 * artwork as components/ui/cut-icons.tsx. This test renders every cut icon to
 * SVG markup and fails when the artwork no longer matches what the font was
 * built from, so an edited icon can't silently draw its old shape on Android.
 *
 * To rebuild after changing an icon:
 *   CUT_ICONS_WRITE=1 npx jest __tests__/components/cutIconFont.test.tsx
 *   python3 scripts/build-cut-icon-font.py   (needs: pip install picosvg fonttools skia-pathops)
 */
import React from "react";
import fs from "fs";
import path from "path";
import { create, act } from "react-test-renderer";

jest.mock("react-native-css-interop/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));
jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: "svg",
  Path: "path",
  G: "g",
  Defs: "defs",
  Mask: "mask",
  Rect: "rect",
  ClipPath: "clipPath",
  Circle: "circle",
}));

const SOURCES = path.join(__dirname, "../../assets/fonts/cut-icons.sources.json");

// react-native-svg prop names to SVG attribute names.
const ATTR: Record<string, string> = {
  strokeWidth: "stroke-width",
  strokeLinejoin: "stroke-linejoin",
  strokeLinecap: "stroke-linecap",
  strokeMiterlimit: "stroke-miterlimit",
  fillRule: "fill-rule",
  clipRule: "clip-rule",
  clipPath: "clip-path",
  maskUnits: "maskUnits",
  viewBox: "viewBox",
};

function toMarkup(node: any): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(toMarkup).join("");
  const attrs = Object.entries(node.props || {})
    .filter(([k, v]) => v !== undefined && v !== null && k !== "children" && k !== "width" && k !== "height")
    .map(([k, v]) => `${ATTR[k] ?? k}="${String(v)}"`)
    .join(" ");
  const tag = node.type === "svg" ? 'svg xmlns="http://www.w3.org/2000/svg"' : node.type;
  const close = node.type === "svg" ? "svg" : node.type;
  return `<${tag}${attrs ? " " + attrs : ""}>${toMarkup(node.children)}</${close}>`;
}

function render(Component: React.ComponentType<any>, props: Record<string, unknown>): string {
  let tree: any;
  act(() => {
    tree = create(<Component size={32} color="#000000" strokeWidth={2} {...props} />);
  });
  // useId differs per render; the ids only tie a clip or mask to its use.
  return toMarkup(tree.toJSON()).replace(/(id="|url\(#)[^")]+/g, "$1u");
}

/** Artwork per component, deduplicated: several names share one drawing. */
function currentSources() {
  const { cutIcons } = require("../../components/ui/cut-icons");
  const byComponent = new Map<unknown, string>();
  const names: Record<string, string> = {};
  const sources: Record<string, { outline: string; filled?: string }> = {};
  for (const [name, Component] of Object.entries(cutIcons) as [string, React.ComponentType<any>][]) {
    let key = byComponent.get(Component);
    if (!key) {
      key = name;
      byComponent.set(Component, key);
      const outline = render(Component, {});
      const filled = render(Component, { fill: "#000000" });
      sources[key] = filled === outline ? { outline } : { outline, filled };
    }
    names[name] = key;
  }
  return { names, sources };
}

describe("cut icon font", () => {
  const current = currentSources();

  if (process.env.CUT_ICONS_WRITE === "1") {
    it("writes the font sources", () => {
      fs.writeFileSync(SOURCES, JSON.stringify(current, null, 2) + "\n");
    });
    return;
  }

  it("was built from the current cut icon artwork", () => {
    const built = JSON.parse(fs.readFileSync(SOURCES, "utf8"));
    expect(current.names).toEqual(built.names);
    for (const [key, source] of Object.entries(current.sources)) {
      if (built.sources[key]?.outline !== source.outline || built.sources[key]?.filled !== source.filled) {
        throw new Error(
          `Cut icon "${key}" changed since cut-icons.ttf was built. Run CUT_ICONS_WRITE=1 npx jest ` +
            "__tests__/components/cutIconFont.test.tsx, then python3 scripts/build-cut-icon-font.py.",
        );
      }
    }
  });

  it("maps every glyph to an icon the font holds", () => {
    const { cutIconGlyphs } = require("../../components/ui/cutIconGlyphs");
    for (const [name, glyph] of Object.entries(cutIconGlyphs) as [string, { o: string; f?: string }][]) {
      expect(current.names[name]).toBeDefined();
      expect(glyph.o).toMatch(/^[-]$/);
      if (glyph.f) expect(current.sources[current.names[name]].filled).toBeDefined();
    }
  });
});
