import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Android is edge-to-edge here, so `adjustResize` no longer shrinks the window
 * for the keyboard. A ScrollView with no KeyboardAvoidingView (or one whose
 * Android behavior is `undefined`) keeps its full height under the keys, and
 * Android never scrolls the focused field into view. The trade amount, limit
 * price, Launchpad links and Bridge amount all sat behind the keyboard.
 *
 * Where the KeyboardAvoidingView sits below ScreenHeader, its onLayout frame is
 * parent-relative and already includes the header, so the offset is only the
 * root inset: `useKeyboardOffset()` with no argument.
 */
const read = (file: string) => readFileSync(resolve(__dirname, "../../screens", file), "utf8");
const KAV_BELOW_HEADER = '<KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={keyboardOffset}>';

function between(src: string, start: string, end: string) {
  const from = src.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  const to = src.indexOf(end, from);
  expect(to).toBeGreaterThan(from);
  return src.slice(from, to);
}

function expectScrollWrappedBelowHeader(body: string, outside: string) {
  expect(body).toMatch(/const keyboardOffset = useKeyboardOffset\(\);/);
  const header = body.indexOf("<ScreenHeader");
  const kav = body.indexOf(KAV_BELOW_HEADER);
  const scroll = body.indexOf("<ScrollView", header);
  const close = body.indexOf("</KeyboardAvoidingView>");
  expect(header).toBeGreaterThan(-1);
  expect(kav).toBeGreaterThan(header);
  expect(scroll).toBeGreaterThan(kav);
  expect(body.lastIndexOf("</ScrollView>")).toBeLessThan(close);
  expect(body.lastIndexOf(outside)).toBeGreaterThan(close);
}

describe("trade screens keep their fields above the keyboard", () => {
  it("wraps the Exchange scroll below the header, with the buy sheet outside", () => {
    const body = between(read("DexScreen.tsx"), "export default function DexScreen()", "\nconst s = StyleSheet.create");
    expectScrollWrappedBelowHeader(body, "<BuyDhbSheet");
  });

  it("wraps the pool terminal scroll, calling the hook in PoolTerminal past the early returns", () => {
    const body = between(read("DexPoolScreen.tsx"), "function PoolTerminal(", "\nconst s = StyleSheet.create");
    expectScrollWrappedBelowHeader(body, "</View>;");
  });

  it("wraps the Launchpad coin scroll, with the refresh mark outside", () => {
    const body = between(read("LaunchpadCoinScreen.tsx"), "export default function LaunchpadCoinScreen()", "\nconst styles = StyleSheet.create");
    expectScrollWrappedBelowHeader(body, "<DeHubRefreshMark");
  });

  it.each(["LaunchpadCreateScreen.tsx", "BridgeScreen.tsx"])("pads for the keyboard on Android too in %s", (file) => {
    const src = read(file);
    expect(src).toMatch(/<KeyboardAvoidingView\s+style=\{styles\.root\}\s+behavior="padding"\s+keyboardVerticalOffset=\{keyboardOffset\}/);
    expect(src).not.toMatch(/Platform\.OS === "ios" \? "padding" : undefined/);
    expect(src).toMatch(/const keyboardOffset = useKeyboardOffset\(\);/);
  });
});

describe("Exchange stats strip", () => {
  it("scrolls sideways so Total liquidity and both LP figures stay reachable", () => {
    const src = read("DexScreen.tsx");
    expect(src).toContain("<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stats}>");
    expect(src).not.toContain("<View style={s.stats}>");
    const strip = between(src, "contentContainerStyle={s.stats}>", "{listError &&");
    expect(strip.trimEnd().endsWith("</ScrollView>")).toBe(true);
  });
});
