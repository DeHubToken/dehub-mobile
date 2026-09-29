import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// React Native items default to flexShrink 0, so a one-line name in a row
// with a badge, handle or timestamp after it keeps its full width and pushes
// the rest past the edge. Each of these rows lets the name give way instead.
const read = (...parts: string[]) =>
  readFileSync(resolve(__dirname, "../..", ...parts), "utf8");

describe("long names shrink instead of spilling", () => {
  it("quoted post: name and handle both shrink", () => {
    const src = read("components", "common", "QuotedPostEmbed.tsx");
    expect(src).toContain('<Text className="text-white font-semibold text-xs shrink" numberOfLines={1}>');
    expect(src).toContain('<Text className="text-theme-neutrals-500 text-xs shrink" numberOfLines={1}>');
  });

  it("compact video card: the creator button shrinks, not just the text inside it", () => {
    const src = read("components", "Home", "CompactVideoCard.tsx");
    expect(src).toMatch(
      /onPress=\{handlePressCreator\}\s+style=\{\{ flexShrink: 1 \}\}\s*>\s*<Text/,
    );
  });

  it("search account card: the name gives way to the badge", () => {
    const src = read("components", "Search", "SearchAccountCard.tsx");
    expect(src).toMatch(
      /className="text-white font-semibold text-sm"\s+style=\{\{ flexShrink: 1, minWidth: 0 \}\}\s+numberOfLines=\{1\}/,
    );
  });

  it("comment header: the name shrinks inside its wrapper so the badge stays in it", () => {
    const src = read("components", "Comments", "CommentItem.tsx");
    expect(src).toContain(
      'style={{ flexShrink: 1, minWidth: 0, fontSize: 16, lineHeight: 20, fontWeight: "600", color: ICON_ACTIVE }}',
    );
  });

  it("comment likers: the name shrinks before the badge", () => {
    const src = read("components", "Comments", "CommentLikersSheet.tsx");
    expect(src).toContain(
      '<Text style={{ color: "#F9FBFF", fontWeight: "600", fontSize: 14, flexShrink: 1 }} numberOfLines={1}>',
    );
  });

  it("comment long-press preview: the name is one line and leaves room for the time", () => {
    const src = read("components", "Comments", "CommentContextMenu.tsx");
    expect(src).toMatch(
      /className="text-sm font-semibold text-theme-neutrals-100"\s+numberOfLines=\{1\}\s+style=\{\{ flexShrink: 1 \}\}\s*>\s*\{displayName\}/,
    );
  });

  it("DM fee banner: the 'set by' name truncates so the fee stays on screen", () => {
    const src = read("components", "DM", "DmFeeBanner.tsx");
    expect(src).toContain(
      '<Text className="shrink text-[11px] text-theme-neutrals-500 ml-1" numberOfLines={1}>',
    );
  });

  describe("community card", () => {
    const src = read("components", "Communities", "CommunityCard.tsx");

    it("puts the time badge at the end of the title row instead of floating over it", () => {
      const titleRow = src.slice(
        src.indexOf("<View style={styles.titleRow}>"),
        src.indexOf("<Text style={styles.desc}"),
      );
      expect(titleRow).toContain("<View style={styles.timeBadge}>");
      expect(titleRow).toMatch(/<Text style=\{styles\.timeText\} numberOfLines=\{1\}>/);
      expect(src.match(/style=\{styles\.timeBadge\}/g)).toHaveLength(1);
    });

    it("keeps the badge in the row's flow and gives the reserved right padding back", () => {
      const badgeStyle = src.slice(src.indexOf("timeBadge: {"), src.indexOf("timeText:"));
      expect(badgeStyle).toContain('marginLeft: "auto"');
      expect(badgeStyle).toContain("flexShrink: 0");
      expect(badgeStyle).not.toMatch(/position:|top:|right:|zIndex:/);
      expect(src).not.toContain("paddingRight: 56");
    });
  });
});
