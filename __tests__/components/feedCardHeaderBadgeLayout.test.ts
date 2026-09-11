import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../../components/Home/FeedCardHeader.tsx"),
  "utf8",
);

describe("feed card badge layout", () => {
  it("keeps the holder badge compact and raised beside the display name", () => {
    expect(source).toContain("getBadgeOpticalStyle(badgeImage, 14, -1)");
    expect(source).not.toContain("getBadgeOpticalStyle(badgeImage, 16)");
  });

  it("keeps badge spacing outside the optical image box", () => {
    expect(source).toContain('style={{ flexShrink: 0, marginLeft: 4 }}');
  });
});
