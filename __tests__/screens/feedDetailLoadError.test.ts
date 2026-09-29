import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) =>
  readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("post page when the post fails to load", () => {
  const detail = readSource("screens/FeedDetailScreen.tsx");
  const fetchBody = detail.slice(
    detail.indexOf("const fetchData = useCallback"),
    detail.indexOf("const handleUserPress"),
  );

  it("tells a removed post apart from a failed load", () => {
    expect(fetchBody).toContain('setLoadError(status === 404 || status === 410 ? "notFound" : "failed")');
    // Cleared on every attempt, so a retry starts from the skeleton.
    expect(fetchBody.indexOf("setLoadError(null)")).toBeLessThan(fetchBody.indexOf("try {"));
  });

  it("keeps the comments already on screen through a failed refetch", () => {
    expect(fetchBody).toContain("setComments((prev) => (isPrivate ? [] : prev))");
    expect(fetchBody).not.toContain("setComments([])");
  });

  it("shows the error with a retry in place of the post", () => {
    const header = detail.slice(
      detail.indexOf("const renderHeader = useCallback"),
      detail.indexOf("{/* Repost & Quote stats row */}"),
    );
    expect(header).toContain('t(loadError === "notFound" ? "common.postNotFound" : "common.failedToLoad")');
    expect(header).toContain('{loadError === "failed" && (');
    expect(header).toContain('t("common.retry")');
  });

  it("drops 'no comments yet' and the composer when there is no post", () => {
    const empty = detail.slice(
      detail.indexOf("ListEmptyComponent={"),
      detail.indexOf("renderItem={renderCommentItem}"),
    );
    expect(empty).toContain(") : !item ? null : loadError ? (");
    expect(empty).toContain('t("comments.loadFailed")');
    expect(empty.indexOf('t("comments.loadFailed")')).toBeLessThan(empty.indexOf('t("comments.noneYetAddYours")'));

    expect(detail).toContain("const postUnavailable = !item && !loading && (loadError != null || privateError);");
    expect(detail).toMatch(/\{!postUnavailable && \(\r?\n\s*<View\r?\n\s*className="absolute left-0 right-0 bottom-0/);
  });
});
