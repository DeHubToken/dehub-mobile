import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Comment and reply boxes on long pages. A KeyboardAvoidingView around the
 * page plus the app-wide screen pan lifted the box twice: it fell below its
 * scroll view, the pan measured it far under the keys and slid the whole
 * screen off into black (governance comments on iPhone).
 */
const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("governance comment box", () => {
  const source = read("screens/GovernanceProposalScreen.tsx");

  it("docks outside the scroll and rides the keyboard itself", () => {
    expect(source).not.toContain("<KeyboardAvoidingView");
    expect(source).toContain("useComposerKeyboard(0, { gap: 0 })");
    const scrollEnd = source.indexOf("</ScrollView>");
    expect(source.indexOf("ref={composerKeyboard.ref}")).toBeGreaterThan(scrollEnd);
    expect(source.indexOf("<TextInput")).toBeGreaterThan(scrollEnd);
  });
});

describe.each([
  "screens/CinemaScreen.tsx",
  "screens/ListingDetailScreen.tsx",
  "screens/StageRecordingScreen.tsx",
])("%s leaves the keyboard to the screen pan", (path) => {
  it("has no KeyboardAvoidingView", () => {
    expect(read(path)).not.toContain("KeyboardAvoidingView");
  });
});

describe("job detail page", () => {
  it("keeps a KeyboardAvoidingView only inside its modal", () => {
    const source = read("screens/WorkJobDetailScreen.tsx");
    expect(source.match(/<KeyboardAvoidingView/g)).toHaveLength(1);
    expect(source).toContain('<KeyboardAvoidingView behavior="padding" style={styles.modalBackdrop}>');
  });
});

describe("screen pan", () => {
  it("never moves the screen further than the keyboard is tall", () => {
    const source = read("components/common/KeyboardPanView.tsx");
    expect(source).toContain("Math.min(overlap + CLEARANCE, keyboardHeight)");
  });
});
