import { readFileSync } from "fs";
import { resolve } from "path";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
const board = read("screens/WorkScreen.tsx");

// The Work board's type tabs sit in a horizontal ScrollView, which RN gives
// flexShrink 1 by default. With a long list (or the keyboard up) the strip was
// squeezed and the tab labels were measured into a sliver and cut in half.
describe("Work board layout", () => {
  it("keeps both chip strips at their natural height", () => {
    expect(board).toMatch(/strip: \{ flexGrow: 0, flexShrink: 0 \}/);
    expect(board.match(/style=\{styles\.strip\}/g)).toHaveLength(2);
  });

  it("wraps the card's meta line so the deadline drops to a right-aligned second line", () => {
    expect(board).toMatch(/metaRow: \{[^}]*flexWrap: "wrap"[^}]*columnGap: 14, rowGap: 6 \}/);
    expect(board).toMatch(/styles\.metaItem, \{ marginLeft: "auto" \}/);
  });
});

// Each form's KeyboardAvoidingView is a sibling rendered after ScreenHeader,
// so its onLayout y already includes the header. Adding SCREEN_HEADER_HEIGHT
// to the offset counted it twice and left a blank band above the keyboard.
describe("Work form keyboard offset", () => {
  const forms = [
    "screens/WorkPostScreen.tsx",
    "screens/WorkEditScreen.tsx",
    "screens/WorkJobDetailScreen.tsx",
    "screens/WorkDisputesScreen.tsx",
  ];

  it.each(forms)("%s offsets by the status-bar inset only", (file) => {
    const src = read(file);
    expect(src).toMatch(/const keyboardOffset = useKeyboardOffset\(\);/);
    expect(src).not.toMatch(/SCREEN_HEADER_HEIGHT/);
    expect(src.indexOf("<KeyboardAvoidingView")).toBeGreaterThan(src.lastIndexOf("<ScreenHeader"));
  });
});
