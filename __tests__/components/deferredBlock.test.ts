import { readFileSync } from "fs";
import { resolve } from "path";

const card = readFileSync(resolve(__dirname, "../../components/Home/FeedCard.tsx"), "utf8");
const header = readFileSync(resolve(__dirname, "../../components/Home/FeedCardHeader.tsx"), "utf8");
const block = readFileSync(resolve(__dirname, "../../components/common/DeferredBlock.tsx"), "utf8");

// Mid-fling a card mounts its action row and header buttons as empty boxes
// of their measured size and fills them in on settle; see DeferredBlock.
describe("feed card defers its heavy blocks while flinging", () => {
  it("wraps the action row", () => {
    expect(card).toMatch(/<DeferredBlock cacheKey="feed-action-bar">\s*<FeedActionBar/);
  });
  it("wraps the header buttons, keyed by which buttons are present", () => {
    expect(header).toMatch(/cacheKey=\{`feed-header-icons:\$\{isHidden \? 1 : 0\}/);
    expect(header).toMatch(/reserveWidth/);
  });
  it("only substitutes a box once a real measurement exists", () => {
    expect(block).toMatch(/if \(!ready && size\)/);
    expect(block).toMatch(/useReadyAfterScroll\(\)/);
  });
});
