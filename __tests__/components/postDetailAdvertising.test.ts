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
    expect(detail).toContain('<PostDetailContinuation currentPostId={String(tokenId)} />');
    expect(detail.indexOf("{showAllCommentsRow}")).toBeLessThan(detail.indexOf("<PostDetailContinuation"));
  });

  it("uses the same served-ad and tracking endpoints as web", () => {
    expect(serving).toContain('supabase.functions.invoke("ads-serve"');
    expect(serving).toContain('supabase.functions.invoke("ads-track"');
    expect(serving).toContain("getAnonViewerId");
    expect(card).toContain('visibleRatio < 0.5');
    expect(card).toContain('>= 1000');
  });

  it("renders the advert before explicitly paginated more posts", () => {
    expect(continuation.indexOf("<SponsoredAdCard")).toBeLessThan(continuation.indexOf("More posts"));
    expect(continuation).toContain('initialPageParam: 1');
    expect(continuation).toContain('accessibilityLabel="Load more posts"');
  });
});
