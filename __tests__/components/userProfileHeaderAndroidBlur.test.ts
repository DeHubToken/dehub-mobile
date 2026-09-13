import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../../components/UserProfile/UserProfileHeader.tsx"),
  "utf8",
);

describe("profile header glass buttons on Android", () => {
  it("never renders real BlurView unguarded", () => {
    // Android's experimental blur crashes with IndexOutOfBoundsException when
    // list views mutate mid-snapshot (see components/Home/FeedNavBar.tsx for
    // the same fix). Every BlurView in this file must be behind an iOS check.
    const lines = source.split("\n");
    lines.forEach((line, i) => {
      if (!line.includes("<BlurView")) return;
      const precedingLines = lines.slice(Math.max(0, i - 3), i).join("\n");
      expect(precedingLines).toMatch(/Platform\.OS === "ios"/);
    });
  });

  it("keeps a same-shaped Android fallback view for each guarded BlurView", () => {
    const blurCount = (source.match(/<BlurView intensity=\{40\}/g) || []).length;
    const fallbackCount = (
      source.match(/backgroundColor: "rgba\(20,20,22,0\.55\)"/g) || []
    ).length;
    expect(blurCount).toBeGreaterThan(0);
    expect(fallbackCount).toBe(blurCount);
  });
});
