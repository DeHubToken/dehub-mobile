import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../../components/Home/FeedCardHeader.tsx"),
  "utf8",
);
const newMemberChipSource = readFileSync(
  resolve(__dirname, "../../components/common/NewMemberChip.tsx"),
  "utf8",
);

describe("feed card badge layout", () => {
  it("keeps the current holder badge size and raises only its artwork", () => {
    expect(source).toContain(
      "getBadgeOpticalStyle(badgeImage, HOLDER_BADGE_SIZE, -1, DISPLAY_NAME_LINE_HEIGHT)",
    );
    expect(source).toContain("const HOLDER_BADGE_SIZE = 16");
  });

  it("keeps animal badge spacing separate and half as wide as the New-chip gap", () => {
    expect(source).toContain("const HOLDER_BADGE_GAP = 2");
    expect(source).toContain("marginLeft: HOLDER_BADGE_GAP");
    expect(source).toMatch(/height: DISPLAY_NAME_LINE_HEIGHT,\s+marginLeft: 4,/);
  });

  it("locks the identity row and both badge wrappers to the name line height", () => {
    expect(source).toContain(
      'alignItems: "center", minWidth: 0, height: DISPLAY_NAME_LINE_HEIGHT',
    );
    expect(source.match(/height: DISPLAY_NAME_LINE_HEIGHT/g)).toHaveLength(3);
    expect(source.match(/justifyContent: "center"/g)).toHaveLength(2);
  });

  it("keeps the New chip inside the name line instead of overflowing toward the username", () => {
    expect(newMemberChipSource).toContain("const CHIP_HEIGHT = 16");
    expect(newMemberChipSource).toContain("const CHIP_TEXT_LINE_HEIGHT = 12");
    expect(newMemberChipSource).not.toContain("py-0.5");
    expect(source).toContain("transform: [{ translateY: -1 }]");
  });

  it("renders the New chip as text only", () => {
    expect(newMemberChipSource).not.toContain('name="Sparkles"');
    expect(newMemberChipSource).not.toContain("CHIP_ICON_SIZE");
    expect(newMemberChipSource).not.toContain('../ui/Icon');
  });
});
