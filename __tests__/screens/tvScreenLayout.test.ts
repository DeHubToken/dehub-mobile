import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(join(__dirname, "..", "..", "screens", "TVScreen.tsx"), "utf8");

describe("Live TV layout", () => {
  // RN gives a horizontal ScrollView flexGrow 1 / flexShrink 1 by default, so
  // with no style of its own the country strip split the spare height with the
  // loader (and short grids) and floated the chips mid-screen.
  it("keeps the country strip one row high", () => {
    expect(source).toMatch(/horizontal[\s\S]{0,120}style=\{styles\.chipScroll\}/);
    expect(source).toMatch(/chipScroll:\s*\{\s*flexGrow:\s*0,\s*flexShrink:\s*0\s*\}/);
  });

  // The player is an edge-to-edge Modal: on Android the keyboard height leaves
  // out the nav bar, so dropping the nav-bar padding put the chat input that far
  // under the keyboard. Only iOS, whose keyboard height includes the home
  // indicator, may drop it.
  it("keeps the chat composer nav-bar padding on Android while typing", () => {
    expect(source).toMatch(/import \{[^}]*\bPlatform\b[^}]*\} from "react-native"/);
    expect(source).toContain('bottomInset={kbVisible && Platform.OS === "ios" ? 0 : insets.bottom}');
    expect(source).not.toContain("bottomInset={kbVisible ? 0 : insets.bottom}");
  });

  it("lifts the player by the raw keyboard height only once", () => {
    expect(source).toContain("marginBottom: kbVisible ? kbHeight : 0");
  });
});
