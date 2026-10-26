import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openImagePostInFeedHost, openPostInFeedHost, setFeedPostHost } from "../../libs/feedPostHost";

const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

afterEach(() => setFeedPostHost(null));

it("lets Home take a post while it is the host, and falls back to navigation otherwise", () => {
  expect(openPostInFeedHost(12)).toBe(false);
  expect(openImagePostInFeedHost({ tokenId: 12 } as any)).toBe(false);
  const host = { openPost: jest.fn(), openImagePost: jest.fn() };
  setFeedPostHost(host);
  expect(openPostInFeedHost(12)).toBe(true);
  expect(host.openPost).toHaveBeenCalledWith("12");
  const photo = { tokenId: 13 } as any;
  expect(openImagePostInFeedHost(photo)).toBe(true);
  expect(host.openImagePost).toHaveBeenCalledWith(photo);
});

it("opens photos in the Images scroll view, text and audio in place, and keeps video on its own page", () => {
  const card = read("components/Home/FeedCard.tsx");
  expect(card).toContain("if (postImage && !inImageFeed && openImagePostInFeedHost(item)) return;");
  expect(card).toContain("if (!isVideo && openPostInFeedHost(tokenId)) return;");
  expect(card).toContain("if (!inImageFeed && !disablePress && openImagePostInFeedHost(item)) return;");
  const home = read("screens/HomeScreen.tsx");
  expect(home).toContain("backMode={feedProfileVisible || !!imageFeed || !!feedPost}");
  expect(home).toContain('testID="home-feed-post"');
  expect(home).toContain("fromFirstPage={imageFeed.fromFirstPage}");
  const detail = read("screens/FeedDetailScreen.tsx");
  // A text post opens as its feed bento.
  expect(detail).toContain('{item && stage && !immersive && resolveContentType(item) !== "audio" ? (');
  // Only a video post drops the logo bar for the back icon.
  expect(detail).toContain("{embedded || (stage && videoPost) ? null : <PostFeedNav");
  expect(detail).toContain("{stage && videoPost && !embedded && <PostStageBackIcon");
});
