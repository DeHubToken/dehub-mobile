import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const SEARCH_DIRS = ["components", "screens", "navigation", "hooks", "libs", "context"];

/** Scrims and navigation frost own blur; ordinary card surfaces remain opaque. */
const ALLOWED = [
  "components/Comments/CommentContextMenu.tsx",
  "components/DM/ConversationContextMenu.tsx",
  "components/DM/MessageContextMenu.tsx",
  "components/LiveChat/LiveChatContextMenu.tsx",
  "components/ui/ChromeSurface.tsx",
  "components/ui/GlassIndicator.tsx",
  "components/ui/GlassModal.tsx",
  "components/ui/IosGlassPill.tsx",
  "components/ui/FrostedPill.tsx",
  "components/ui/FrostedBackdrop.tsx",
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
    // The seven buttons now share one opaque base (the minimal theme swaps it
    // for an outline), so the fill is written once rather than seven times.
    expect(source).toMatch(/backgroundColor: "#18181B"/);
  });
});
