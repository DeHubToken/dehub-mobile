import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openPostInFeedHost, setFeedPostHost } from "../../libs/feedPostHost";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

afterEach(() => setFeedPostHost(null));

it("lets Home take a post while it is the host, and falls back to navigation otherwise", () => {
  expect(openPostInFeedHost(12)).toBe(false);
  const host = jest.fn(() => true);
  setFeedPostHost(host);
  expect(openPostInFeedHost(12)).toBe(true);
  expect(host).toHaveBeenCalledWith("12", undefined);
});

it("opens text, image and audio posts in place on Home and keeps video on its own page, as a bento", () => {
  const card = read("components/Home/FeedCard.tsx");
  expect(card).toContain("if (!isVideo && openPostInFeedHost(tokenId)) return;");
  const home = read("screens/HomeScreen.tsx");
  expect(home).toContain("backMode={feedProfileVisible || !!imageFeed || !!feedPost}");
  expect(home).toContain('testID="home-feed-post"');
  expect(home).toContain("useSwipeBackAction(closeFeedPost, !!feedPost && !feedProfileVisible);");
  expect(home).toContain("entering={FadeInUp.duration(220)");
  const detail = read("screens/FeedDetailScreen.tsx");
  // Every post opens as its feed bento, video too, at the feed's first-card spot.
  expect(detail).toContain("{item && stage ? (");
  expect(detail).toContain("paddingHorizontal: FEED_SIDE, paddingTop: FEED_TOP");
  // Every post page keeps the logo bar and pill, video too: no floating back icon.
  expect(detail).toContain("{embedded ? null : <PostFeedNav");
  expect(detail).not.toContain("<PostStageBackIcon");
});

it("leaves a comment tap to the card when Home turns it down under a profile", () => {
  setFeedPostHost((_id, options) => !options?.comments);
  expect(openPostInFeedHost(12, { comments: true })).toBe(false);
  expect(openPostInFeedHost(12)).toBe(true);
  const home = read("screens/HomeScreen.tsx");
  expect(home).toContain("if (options?.comments && isProfileVisible()) return false;");
});
