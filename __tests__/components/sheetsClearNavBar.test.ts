import { readFileSync } from "fs";
import { join } from "path";

/**
 * With edgeToEdgeEnabled, RN 0.81 draws every <Modal> under the Android nav
 * bar, so a bottom sheet in one has to pay `insets.bottom` itself. These sheets
 * had fixed padding only, which left their last control behind the 3-button
 * bar. Sheets with a text field drop the inset while the keyboard is up, since
 * the keyboard already lifts them clear of the bar.
 */
const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8").replace(/\r\n/g, "\n");

const importsInsets = (src: string) =>
  expect(src).toMatch(/import \{ useSafeAreaInsets \} from ["']react-native-safe-area-context["']/);

/** Hooks must run before the component's early `return null`. */
const hookBefore = (src: string, hook: string, earlyReturn: string) => {
  const hookAt = src.indexOf(hook);
  const returnAt = src.indexOf(earlyReturn);
  expect(hookAt).toBeGreaterThan(-1);
  expect(returnAt).toBeGreaterThan(-1);
  expect(hookAt).toBeLessThan(returnAt);
};

describe("bottom sheets clear the Android nav bar", () => {
  it("chat fullscreen player pads its controls and close button by the insets", () => {
    const src = read("components", "common", "FullScreenVideoPlayer.tsx");
    expect(src).toContain("const sideInset = Math.max(insets.left, insets.right);");
    expect(src).toContain("paddingBottom: insets.bottom + 24, paddingHorizontal: sideInset + 16");
    expect(src).toContain("top: insets.top + 8, left: sideInset + 16");
    expect(src).not.toContain("bottom-0 pb-6");
    expect(src).not.toContain('"absolute left-4 z-50"');
  });

  it("caption fix sheet keeps Submit above the bar, but not above the keyboard", () => {
    const src = read("components", "VideoPlayerCore", "CaptionFixSheet.tsx");
    importsInsets(src);
    expect(src).toContain("const { isVisible: kbUp } = useKeyboard();");
    expect(src).toContain("paddingBottom: kbUp ? 20 : Math.max(20, insets.bottom + 16)");
  });

  it("subtitle picker pads its language list and reads insets before the early return", () => {
    const src = read("components", "VideoPlayerCore", "CaptionOverlay.tsx");
    importsInsets(src);
    expect(src).toContain("paddingBottom: Math.max(24, insets.bottom + 12)");
    hookBefore(src, "const insets = useSafeAreaInsets();", "if (!ref) return null;");
  });

  it("community chat message actions keep Cancel above the bar", () => {
    const src = read("components", "Communities", "CommunityChatPanel.tsx");
    importsInsets(src);
    expect(src).toContain("const insets = useSafeAreaInsets();");
    expect(src).toContain("[styles.sheet, { paddingBottom: Math.max(28, insets.bottom + 16) }]");
  });

  it("stream shop sheets pad by the inset, and checkout drops it for the keyboard", () => {
    const src = read("components", "LiveViewer", "StreamShopOverlay.tsx");
    importsInsets(src);
    expect(src).not.toMatch(/\bpb-8\b/);
    expect(src).toContain("paddingBottom: kbUp ? 32 : Math.max(32, insets.bottom + 16)");
    expect(src).toContain("paddingBottom: Math.max(32, insets.bottom + 16) }}");
    hookBefore(src, "const { isVisible: kbUp } = useKeyboard();", "if (!product || !listing) return null;");
  });

  it("shop board pads its scroll content, and reads insets before the early return", () => {
    const src = read("components", "common", "ShopBoard.tsx");
    importsInsets(src);
    expect(src).toContain("contentContainerStyle={{ paddingBottom: Math.max(24, insets.bottom + 16) }}");
    expect(src).not.toContain('className="px-3 pb-6"');
    hookBefore(src, "const insets = useSafeAreaInsets();", "if (total === 0) return null;");
  });

  it("pin-to-profile picker keeps its last row above the bar", () => {
    const src = read("components", "Communities", "PinnedCommunities.tsx");
    importsInsets(src);
    expect(src).toContain("[styles.modalSheet, { paddingBottom: Math.max(32, insets.bottom + 16) }]");
  });

  it("appeal sheet keeps its footnote above the bar, but not above the keyboard", () => {
    const src = read("components", "Notifications", "AppealSheet.tsx");
    importsInsets(src);
    expect(src).toContain("const { isVisible: kbUp } = useKeyboard();");
    expect(src).toContain("paddingBottom: kbUp ? 20 : Math.max(20, insets.bottom + 16)");
  });

  it("builder preview does not pay the bottom inset the root SafeAreaView already pays", () => {
    const src = read("screens", "BuilderPreviewScreen.tsx");
    expect(src).not.toContain("useSafeAreaInsets");
    expect(src).not.toContain("paddingBottom: insets.bottom");
    expect(src).toContain("<View style={{ flex: 1 }}>");
  });
});
