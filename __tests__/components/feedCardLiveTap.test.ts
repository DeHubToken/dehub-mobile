/**
 * On a live's own post page the card's tap is off (it would open the page it
 * is on), and the playing live did nothing when tapped. The live picture opens
 * the live viewer there too.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "../../components/Home/FeedCard.tsx"), "utf8");

function body(name: string): string {
  const start = source.indexOf(`const ${name} = useCallback(`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("}, [", start));
}

describe("tapping the live picture in a post card", () => {
  it("is wired to the live picture handler, not the card's own tap", () => {
    const preview = source.slice(source.indexOf("<LiveFeedPreview"), source.indexOf("/>", source.indexOf("<LiveFeedPreview")));
    expect(preview).toContain("onPress={handleLivePicturePress}");
  });

  it("opens the live even where the card's tap is off", () => {
    const handler = body("handleLivePicturePress");
    expect(handler).toMatch(/if \(!disablePress\) \{\s+handleCardPress\(\);\s+return;\s+\}/);
    expect(handler).toContain("openLive();");
  });

  it("keeps the card's own tap off on the post page", () => {
    expect(body("handleCardPress")).toContain("if (disablePress) return;");
  });
});
