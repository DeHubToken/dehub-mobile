import {
  loadCommentDraft,
  saveCommentDraft,
  clearCommentDraft,
  __resetCommentDraftCacheForTests,
} from "../../libs/comment-draft-cache";
import { storage } from "../../libs/storage";

/**
 * Mirrors dehubweb's src/test/comment-draft-cache.test.ts. The report both
 * exist for: a comment typed into the sheet, the sheet closing on a stray tap,
 * and the text gone. It is on disk now, reply target and all, and reopening
 * the sheet hands it straight back.
 */

const STORAGE_KEY = "dehub-comment-drafts-v2";

describe("comment draft cache", () => {
  beforeEach(() => {
    storage.delete(STORAGE_KEY);
    __resetCommentDraftCacheForTests();
  });

  it("gives a reply draft back on the next open, reply target and all", () => {
    saveCommentDraft(42, { text: "half a thought", parentId: 7, parentUsername: "ada" });

    __resetCommentDraftCacheForTests(); // as if the app had been killed
    const draft = loadCommentDraft(42);

    expect(draft?.text).toBe("half a thought");
    expect(draft?.parentId).toBe(7);
    expect(draft?.parentUsername).toBe("ada");
  });

  it("takes a number or a string for the same post", () => {
    saveCommentDraft("42", { text: "same post" });
    expect(loadCommentDraft(42)?.text).toBe("same post");
  });

  it("keeps one draft per post, so changing reply target cannot orphan text", () => {
    saveCommentDraft(42, { text: "still writing", parentId: 7 });
    saveCommentDraft(42, { text: "still writing", parentId: 9 });

    expect(loadCommentDraft(42)?.parentId).toBe(9);
    expect(Object.keys(JSON.parse(storage.getString(STORAGE_KEY) as string))).toEqual(["42"]);
  });

  it("holds a GIF with no text, and drops an entry once the box is empty", () => {
    saveCommentDraft(42, { text: "", gifUrl: "https://giphy.test/a.gif" });
    expect(loadCommentDraft(42)?.gifUrl).toBe("https://giphy.test/a.gif");

    saveCommentDraft(42, { text: "   " });
    expect(loadCommentDraft(42)).toBeNull();
  });

  it("keeps posts apart and clears only the one that posted", () => {
    saveCommentDraft(1, { text: "first" });
    saveCommentDraft(2, { text: "second" });

    clearCommentDraft(1);

    expect(loadCommentDraft(1)).toBeNull();
    expect(loadCommentDraft(2)?.text).toBe("second");
  });

  it("forgets a draft nobody came back to", () => {
    const ancient = Date.now() - 31 * 24 * 60 * 60 * 1000;
    storage.set(STORAGE_KEY, JSON.stringify({ "5": { text: "from last month", updatedAt: ancient } }));
    __resetCommentDraftCacheForTests();

    expect(loadCommentDraft(5)).toBeNull();
  });
});
