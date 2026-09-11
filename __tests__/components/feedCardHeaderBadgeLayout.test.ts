import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../../components/Home/FeedCardHeader.tsx"),
  "utf8",
);

describe("feed card badge layout", () => {
  it("keeps the current holder badge size and raises only its artwork", () => {
    expect(source).toContain(
      "getBadgeOpticalStyle(badgeImage, HOLDER_BADGE_SIZE, -1, DISPLAY_NAME_LINE_HEIGHT)",
    );
    expect(source).toContain("const HOLDER_BADGE_SIZE = 16");
  });

  it("locks the identity row and both badge wrappers to the name line height", () => {
    expect(source).toContain(
      'alignItems: "center", minWidth: 0, height: DISPLAY_NAME_LINE_HEIGHT',
    );
    expect(source.match(/height: DISPLAY_NAME_LINE_HEIGHT/g)).toHaveLength(3);
    expect(source.match(/justifyContent: "center"/g)).toHaveLength(2);
  });
});
