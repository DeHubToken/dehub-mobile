import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

const visitor = read("components/UserProfile/UserProfileBottomContentTabs.tsx");
const own = read("components/Profile/ProfileTabs.tsx");
const collapse = read("components/Profile/useProfileCollapse.ts");
const tabBar = read("components/Profile/ProfileTabBar.tsx");

describe("profile tabs switch without rebuilding", () => {
  it("keeps opened tabs mounted in a hidden Activity on both profiles", () => {
    for (const source of [visitor, own]) {
      expect(source).toContain('mode={');
      expect(source).toContain('"visible" : "hidden"');
      expect(source).toContain("MAX_KEPT_TABS");
      expect(source).toContain("tabOffsets");
    }
  });

  it("gives each kept tab its own list ref", () => {
    expect(visitor).toContain("listRefFor(tab)");
    expect(visitor).not.toMatch(/listRef=\{listRef\}/);
  });

  it("ignores the zero measurements of hidden header copies", () => {
    expect(collapse).toContain("if (bottom > 0) identityBottom.value = bottom");
    expect(collapse).toContain("if (bottom > 0) actionsBottom.value = bottom");
    expect(visitor).toContain("if (height > 0) headerHeightShared.value = height");
    expect(own).toContain("if (height > 0) headerHeight.value = height");
  });

  it("keeps the images grid when coming back to the same query", () => {
    expect(visitor).toContain("imagesQueryRef.current === query");
  });
});

describe("pinned profile tab rail", () => {
  // A software-layer mask invalidated itself on every draw and kept the app
  // redrawing at full rate while the profile sat still.
  it("does not render its edge mask in software", () => {
    expect(tabBar).not.toContain('androidRenderingMode="software"');
  });
});
