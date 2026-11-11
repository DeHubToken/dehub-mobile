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
jest.mock("react-native-svg", () => ({ __esModule: true, default: "Svg", Path: "Path", G: "G", Defs: "Defs", Mask: "Mask", Rect: "Rect", ClipPath: "ClipPath" }));
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
// The cut font is off unless a test turns it on.
let mockCutFontReady = false;
jest.mock("../../libs/iconFont", () => ({
  ICON_FONT_FAMILY: "LucideIcons",
  CUT_ICON_FONT_FAMILY: "CutIcons",
  isIconFontReady: () => true,
  isCutIconFontReady: () => mockCutFontReady,
}));

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
    const tree = render(<Icon name="Activity" size={20} color="#fff" />).toJSON() as any;
    expect(tree.type).toBe("Text");
    expect(tree.children).toEqual([iconGlyphs.Activity]);
    // The box is wider than the icon, its extra width taken back by the
    // margins, so ink that runs to the em's edges is not clipped (Radio).
    expect(tree.props.style).toMatchObject({ fontFamily: "LucideIcons", width: 30, marginHorizontal: -5, height: 20, color: "#fff" });
    // 20dp is 56.25px here; the font size lands just under 56px so Android's
    // round-up to whole pixels gives the box's own height.
    expect(Math.ceil(tree.props.style.fontSize * 2.8125)).toBe(56);
    expect(tree.props.allowFontScaling).toBe(false);
  });

  it("keeps a pressable icon's button and draws the glyph inside it", () => {
    const { texts, types } = walk(render(<Icon name="Anchor" size={20} onPress={jest.fn()} accessibilityLabel="Details" />).toJSON());
    expect(texts).toEqual([iconGlyphs.Anchor]);
    expect(types).not.toContain("Svg");
  });

  it("leaves filled, gradient and other-stroke icons on SVG", () => {
    for (const props of [{ fill: "#fff" }, { strokeWidth: 2.6 }, { gradient: ["#000", "#fff"] }]) {
      const { texts } = walk(render(<Icon name="ThumbsUp" size={20} {...props} />).toJSON());
      expect(texts).not.toContain(iconGlyphs.ThumbsUp);
    }
  });

  it("fills the Cut thumb without losing its separate cuff", () => {
    const tree = render(<Icon name="ThumbsUp" size={20} fill="#fff" />).toJSON() as any;
    expect(tree.type).toBe("Svg");
    expect(tree.props.viewBox).toBe("0 0 32 32");
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].props.fill).toBe("#fff");
  });

  it("uses approved Cut artwork even when the old Android font is ready", () => {
    const approved = require("../../components/ui/cut-icon-paths.json");
    for (const [name, shape] of [["Bell", "Alerts"], ["MessageSquare", "Messages"], ["Share2", "FeedShare"], ["Blog", "Blog"], ["Coins", "Coins"], ["Copy", "Copy"], ["Quote", "Quote"], ["Flag", "Report"], ["Users", "Communities"], ["Film", "Editor"], ["Creator", "Creator"], ["SquareUserRound", "Growing"], ["Star", "New members"], ["MessagesSquare", "Chat"], ["Wand", "Prompt"], ["Zap", "SuperPowers"], ["AtSign", "Usernames"], ["Tv", "Live TV"], ["ArrowDownToLine", "Converter"], ["FolderInput", "Migrate"], ["Scroll", "Glossary"], ["Bot", "Agents"], ["Plug", "Connect"]]) {
      const tree = render(<Icon name={name} />).toJSON() as any;
      expect(tree.type).toBe("Svg");
      expect(tree.props.viewBox).toBe("0 0 32 32");
      const expected = [...approved[shape].matchAll(/ d="([^"]+)"/g)].map((m: any) => m[1]);
      const paths = (nodes: any[]): string[] => nodes.flatMap(n => n.type === "Path" ? [n.props.d] : paths(n.children || []));
      expect(paths(tree.children)).toEqual(expected);
    }
  });

  it("renders every Cut mapping, including custom names outside the Lucide registry", () => {
    const { cutIcons } = require("../../components/ui/cut-icons");
    for (const name of Object.keys(cutIcons)) {
      const view = render(<Icon name={name} size={24} color="#fff" />);
      const tree = view.toJSON() as any;
      expect(tree.type).toBe("Svg");
      expect(tree.props.viewBox).toBe("0 0 32 32");
      view.unmount();
    }
  });

  describe("with the cut icon font loaded", () => {
    const { cutIconGlyphs } = require("../../components/ui/cutIconGlyphs");
    beforeEach(() => { mockCutFontReady = true; });
    afterEach(() => { mockCutFontReady = false; });

    it("draws a feed card's cut icons as one CutIcons glyph each", () => {
      for (const name of ["ThumbsUp", "ThumbsDown", "MessageSquare", "Share2", "Gem", "Bookmark", "Info", "Zap", "EllipsisVertical", "TimeAgo", "ChartColumn", "Lock"]) {
        const tree = render(<Icon name={name} size={20} color="#a1a1aa" />).toJSON() as any;
        expect(tree.type).toBe("Text");
        expect(tree.children).toEqual([cutIconGlyphs[name].o]);
        expect(tree.props.style).toMatchObject({ fontFamily: "CutIcons", width: 30, marginHorizontal: -5, height: 20, color: "#a1a1aa" });
      }
    });

    it("draws an icon filled with its own colour as the filled glyph", () => {
      const tree = render(<Icon name="ThumbsUp" size={20} color="#F2F2F2" fill="#f2f2f2" />).toJSON() as any;
      expect(tree.type).toBe("Text");
      expect(tree.children).toEqual([cutIconGlyphs.ThumbsUp.f]);
    });

    it("keeps two-tone, other-stroke, masked and gradient cut icons off the font", () => {
      for (const props of [{ name: "Gem", fill: "#123456", color: "#fff" }, { name: "Gem", strokeWidth: 1.8 }, { name: "EyeOff" }]) {
        const { types } = walk(render(<Icon size={20} {...(props as any)} />).toJSON());
        expect(types).toContain("Svg");
        expect(types).not.toContain("Text");
      }
      const { types } = walk(render(<Icon name="ThumbsUp" size={20} gradient={["#000", "#fff"]} />).toJSON());
      expect(types).toContain("MaskedView");
      expect(types).not.toContain("Text");
    });

    it("keeps a pressable cut icon's button and draws the glyph inside it", () => {
      const { texts, types } = walk(render(<Icon name="Bookmark" size={20} onPress={jest.fn()} accessibilityLabel="Save" />).toJSON());
      expect(texts).toEqual([cutIconGlyphs.Bookmark.o]);
      expect(types).not.toContain("Svg");
    });
  });
});
