import React from "react";
import { render } from "@testing-library/react-native";
import { iconGlyphs } from "../../components/ui/iconGlyphs";

jest.mock("react-native-css-interop/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));
jest.mock("react-native", () => ({
  View: "View",
  Pressable: "Pressable",
  Text: "Text",
  Modal: "Modal",
  Platform: { OS: "android", select: (o: any) => o.android ?? o.default },
  PixelRatio: { get: () => 2.8125 },
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s, absoluteFill: {} },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  findNodeHandle: jest.fn(),
}));
jest.mock("react-native-svg", () => ({ __esModule: true, default: "Svg", Path: "Path" }));
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: "View" },
  useSharedValue: jest.fn(),
  useAnimatedStyle: jest.fn(),
  withTiming: jest.fn(),
  withDelay: jest.fn(),
  runOnJS: jest.fn(),
}));
jest.mock("@react-native-masked-view/masked-view", () => "MaskedView");
jest.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
jest.mock("../../components/ui/GlassIndicator", () => ({ __esModule: true, default: "GlassIndicator", GLASS_SHADOW: {} }));
jest.mock("../../libs/iconFont", () => ({ ICON_FONT_FAMILY: "LucideIcons", isIconFontReady: () => true }));

/** Every Text node's string children, and every node type, in a rendered tree. */
function walk(node: any, out = { texts: [] as string[], types: [] as string[] }) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, out));
    return out;
  }
  out.types.push(node.type);
  if (node.type === "Text") out.texts.push(...(node.children || []).filter((c: unknown) => typeof c === "string"));
  walk(node.children, out);
  return out;
}

// On Android a plain icon is one Text glyph of lucide's font, not an SvgView
// that the platform rasterises into its own bitmap.
describe("Icon glyphs on Android", () => {
  const Icon = require("../../components/ui/Icon").default;

  it("maps every registered icon to a glyph", () => {
    expect(Object.keys(iconGlyphs).length).toBeGreaterThanOrEqual(290);
    expect(iconGlyphs.Eye).toBe("");
  });

  it("draws a plain icon as one glyph that fills its box", () => {
    const tree = render(<Icon name="Eye" size={20} color="#fff" />).toJSON() as any;
    expect(tree.type).toBe("Text");
    expect(tree.children).toEqual([iconGlyphs.Eye]);
    expect(tree.props.style).toMatchObject({ fontFamily: "LucideIcons", width: 20, height: 20, color: "#fff" });
    // 20dp is 56.25px here; the font size lands just under 56px so Android's
    // round-up to whole pixels gives the box's own height.
    expect(Math.ceil(tree.props.style.fontSize * 2.8125)).toBe(56);
    expect(tree.props.allowFontScaling).toBe(false);
  });

  it("keeps a pressable icon's button and draws the glyph inside it", () => {
    const { texts, types } = walk(render(<Icon name="Info" size={20} onPress={jest.fn()} accessibilityLabel="Details" />).toJSON());
    expect(texts).toEqual([iconGlyphs.Info]);
    expect(types).not.toContain("Svg");
  });

  it("leaves filled, gradient and other-stroke icons on SVG", () => {
    for (const props of [{ fill: "#fff" }, { strokeWidth: 2.6 }, { gradient: ["#000", "#fff"] }]) {
      const { texts } = walk(render(<Icon name="ThumbsUp" size={20} {...props} />).toJSON());
      expect(texts).not.toContain(iconGlyphs.ThumbsUp);
    }
  });

  it("fills the liked thumb as one merged path", () => {
    const tree = render(<Icon name="ThumbsUp" size={20} fill="#fff" />).toJSON() as any;
    expect(tree.type).toBe("Svg");
    expect(tree.children).toHaveLength(1);
  });
});
