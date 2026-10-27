import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) =>
  readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("post detail advertising continuation", () => {
  const detail = readSource("screens/FeedDetailScreen.tsx");
  const continuation = readSource("components/Advertising/PostDetailContinuation.tsx");
  const serving = readSource("hooks/useAdServing.ts");
  const card = readSource("components/Advertising/SponsoredAdCard.tsx");

  it("places the continuation after the detail screen's comments", () => {
    expect(detail).toContain("{showAllCommentsRow}");
    expect(detail).toContain('<PostDetailContinuation currentPostId={String(tokenId)} loadMoreSignal={leanPost ? morePostsSignal : undefined} />');
    expect(detail.indexOf("{showAllCommentsRow}")).toBeLessThan(detail.indexOf("<PostDetailContinuation"));
  });

  it("puts the ad straight under phone text and image posts and keeps loading posts", () => {
    expect(detail).toContain('const leanPost = !!item && stage && !videoPost && !focusCommentId && resolveContentType(item) === "image";');
    expect(detail).toContain("data={leanPost ? EMPTY_COMMENTS : visibleComments}");
    expect(detail).toContain("onEndReached={handleEndReached}");
    expect(continuation).toContain("{hasNextPage && !autoLoad && (");
  });

  it("uses the same served-ad and tracking endpoints as web", () => {
    expect(serving).toContain('supabase.functions.invoke("ads-serve"');
    expect(serving).toContain('supabase.functions.invoke("ads-track"');
    expect(serving).toContain("getAnonViewerId");
    expect(card).toContain('visibleRatio < 0.5');
    expect(card).toContain('>= 1000');
  });

  it("renders the advert before explicitly paginated more posts", () => {
    expect(continuation.indexOf("<SponsoredAdCard")).toBeLessThan(continuation.indexOf('t("ads.morePosts")'));
    expect(continuation).toContain('initialPageParam: 1');
    expect(continuation).toContain('accessibilityLabel={t("ads.loadMorePosts")}');
  });
});
