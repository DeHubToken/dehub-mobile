import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../../components/UserProfile/UserProfileHeader.tsx"),
  "utf8",
);

describe("profile header stable height while mutuals/plans load", () => {
  // Both rows are separate requests that resolve after the header first
  // paints; without a placeholder they pop from 0 height to their real
  // height under whatever the reader is looking at.
  it("reserves the mutuals row's height while its request is in flight", () => {
    expect(source).toContain("mutualsLoading && !mutuals?.length");
    expect(source).toContain("s.mutualsPlaceholder");
  });

  it("reserves the subscribe button's height while plans are loading", () => {
    expect(source).toContain("plansLoading && !hasPlans");
    expect(source).toContain("s.subscribePlaceholder");
  });

  it("gives both placeholders a fixed, non-zero height contribution", () => {
    expect(source).toMatch(/mutualsPlaceholder:\s*{\s*height:\s*\d+/);
    // subscribePlaceholder reuses glassBtn's fixed BTN_H, so it only needs
    // its own margin/background, not a height of its own.
    expect(source).toMatch(/subscribePlaceholder:\s*{\s*marginTop:\s*\d+/);
  });
});
