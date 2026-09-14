import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const SEARCH_DIRS = ["components", "screens", "navigation", "hooks", "libs", "context"];

/**
 * The only files allowed to import expo-blur.
 *
 * expo-blur does not blur on Android: `BlurMethod.NONE` is the default, and
 * nothing here passes `experimentalBlurMethod`, so a BlurView paints a flat
 * tint — `alpha = intensity/100 * 0.69` over #191919 for tint="dark". Panels
 * built on one are therefore translucent, and the text on them competes with
 * whatever is behind. Enabling the real blur is not the alternative either:
 * dimezisBlurView re-snapshots the root view every frame and throws
 * IndexOutOfBoundsException when a list mutates its children mid-draw.
 *
 * So a BlurView is only defensible on a surface that is *meant* to show what
 * is behind it:
 *
 *  - the four context menus and GlassModal put theirs on the full-screen
 *    scrim, never on the panel — a scrim exists to reveal what it covers;
 *  - the feed nav pill, its sliding indicator and the floating tab bar are the
 *    swallow effect, where content reading through the glass is the point.
 *
 * Anything else is a panel, a card, a menu or a control, and must be opaque.
 * Adding a file here needs a reason that fits one of the two cases above.
 */
const ALLOWED = [
  "components/Comments/CommentContextMenu.tsx",
  "components/DM/ConversationContextMenu.tsx",
  "components/DM/MessageContextMenu.tsx",
  "components/Home/FeedNavBar.tsx",
  "components/LiveChat/LiveChatContextMenu.tsx",
  "components/ui/GlassIndicator.tsx",
  "components/ui/GlassModal.tsx",
  "navigation/FloatingBottomTabBar.tsx",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("app surfaces stay opaque", () => {
  const importers = SEARCH_DIRS.flatMap((d) => walk(resolve(ROOT, d)))
    .filter((f) => /from ['"]expo-blur['"]/.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(ROOT.length + 1).split("\\").join("/"))
    .sort();

  it("only lets the scrims and the nav chrome import expo-blur", () => {
    expect(importers).toEqual([...ALLOWED].sort());
  });

  it("keeps the profile header's button base opaque", () => {
    // This file used to render seven BlurViews behind an iOS check, each with a
    // 55%-opaque Android fallback, so the banner photo read through the labels.
    const source = readFileSync(
      resolve(ROOT, "components/UserProfile/UserProfileHeader.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/<BlurView/);
    expect(source).not.toMatch(/rgba\(20,20,22,0\.55\)/);
    expect(source.match(/backgroundColor: "#18181B"/g)?.length).toBe(7);
  });
});
