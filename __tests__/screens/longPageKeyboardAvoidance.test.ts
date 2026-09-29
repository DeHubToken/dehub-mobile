import { readFileSync } from "fs";
import { join } from "path";

/**
 * Long pages whose inputs sit low enough for the keyboard to cover them. The
 * app draws edge-to-edge, so Android's adjustResize does nothing and each page
 * has to make room itself. The KeyboardAvoidingView is the screen root and
 * wraps the ScreenHeader, so its offset is only the root SafeAreaView's inset:
 * adding SCREEN_HEADER_HEIGHT would count the header twice and leave a blank
 * band above the keys.
 */
const read = (file: string) => readFileSync(join(process.cwd(), "screens", file), "utf8");

const SCREENS: { file: string; component: string; branch: string }[] = [
  // Only the film page has the review box; the search hub keeps its plain root.
  { file: "CinemaScreen.tsx", component: "export default function CinemaScreen()", branch: "if (filmId) {" },
  { file: "PacksScreen.tsx", component: "export default function PacksScreen()", branch: "  return (" },
  // The loading and not-found returns come first and have no inputs.
  { file: "PackScreen.tsx", component: "export default function PackScreen()", branch: "  const saveName = () =>" },
  { file: "StatsScreen.tsx", component: "export default function StatsScreen()", branch: "  return (" },
];

const ROOT_KAV =
  '<KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={keyboardOffset}>';

describe.each(SCREENS)("$file keeps its inputs above the keyboard", ({ file, component, branch }) => {
  const source = read(file);
  const body = source.slice(source.indexOf(component));

  it("reads the offset for a root KeyboardAvoidingView, without the header height", () => {
    expect(source).toContain('import { useKeyboardOffset } from "../hooks/useKeyboardLayout";');
    expect(body).toContain("const keyboardOffset = useKeyboardOffset();");
    expect(source).not.toContain("SCREEN_HEADER_HEIGHT");
  });

  it("calls the hook before any early return", () => {
    const hook = body.indexOf("useKeyboardOffset()");
    const firstReturn = body.search(/\n\s+return[\s(]/);
    expect(hook).toBeGreaterThan(-1);
    expect(hook).toBeLessThan(firstReturn);
  });

  it("makes the KeyboardAvoidingView the root, around the ScreenHeader", () => {
    const rendered = body.slice(body.indexOf(branch));
    const kav = rendered.indexOf(ROOT_KAV);
    expect(kav).toBeGreaterThan(-1);
    expect(rendered.slice(kav + ROOT_KAV.length).trimStart().startsWith("<ScreenHeader")).toBe(true);
  });
});

describe("Stats feedback form", () => {
  const source = read("StatsScreen.tsx");

  it("lets the first tap on the consent box or Send land while the keyboard is up", () => {
    expect(source).toMatch(/<ScrollView\s+contentContainerStyle=\{styles\.content\}\s+keyboardShouldPersistTaps="handled"/);
  });

  it("returns to the Root under the page instead of stacking a second one", () => {
    expect(source).toContain(
      'navigation.navigate(ScreenNames.Root, { screen: ScreenNames.Explore, params: { section: "newMembers" } }, { pop: true })',
    );
  });
});
