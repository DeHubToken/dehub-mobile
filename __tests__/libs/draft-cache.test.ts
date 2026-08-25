import {
  readDraft,
  writeDraft,
  clearDraft,
  hasDraft,
  dmDraftKey,
  subscribeDrafts,
  __resetDraftCacheForTests,
} from "../../libs/draft-cache";
import { storage } from "../../libs/storage";

/**
 * Mirrors dehubweb's src/lib/__tests__/draft-cache.test.ts. The bug both exist
 * for: a DM to someone you have never messaged has no conversation id at all
 * until createAndStart answers, so a draft keyed on that id is written under
 * one name and read under another — and the window where that matters is
 * exactly the window where you are typing the first message.
 */

const STORAGE_KEY = "dehub-drafts-v1";
const PEER = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";

describe("dmDraftKey", () => {
  it("lower-cases so a checksummed and a lowercase address agree", () => {
    expect(dmDraftKey(PEER)).toBe(dmDraftKey(PEER.toLowerCase()));
  });

  it("keeps groups in their own namespace", () => {
    expect(dmDraftKey(null, "grp1")).toBe("group:grp1");
    expect(dmDraftKey(null, "grp1")).not.toBe(dmDraftKey("grp1"));
  });

  it("is null with nothing to key on, which turns persistence off", () => {
    expect(dmDraftKey(undefined)).toBeNull();
    expect(dmDraftKey("")).toBeNull();
  });
});

describe("draft-cache", () => {
  beforeEach(() => {
    storage.delete(STORAGE_KEY);
    __resetDraftCacheForTests();
  });

  it("reads back what it wrote, in the same tick", () => {
    writeDraft("dm:0xabc", "half a sentence");
    expect(readDraft("dm:0xabc")).toBe("half a sentence");
    expect(hasDraft("dm:0xabc")).toBe(true);
  });

  it("survives the app being killed — drop the mirror, read from storage", () => {
    writeDraft("dm:0xabc", "still here");
    __resetDraftCacheForTests();
    expect(readDraft("dm:0xabc")).toBe("still here");
  });

  it("is found under the peer whether or not a conversation exists yet", () => {
    const key = dmDraftKey(PEER)!;
    writeDraft(key, "typed before the server caught up");
    __resetDraftCacheForTests();
    expect(readDraft(dmDraftKey(PEER.toLowerCase())!)).toBe("typed before the server caught up");
  });

  it("treats whitespace-only as no draft, and clears an existing one", () => {
    writeDraft("dm:0xabc", "something");
    writeDraft("dm:0xabc", "   \n ");
    expect(readDraft("dm:0xabc")).toBe("");
    expect(hasDraft("dm:0xabc")).toBe(false);
  });

  it("clearDraft removes it from storage, not just from memory", () => {
    writeDraft("dm:0xabc", "sent this one");
    clearDraft("dm:0xabc");
    __resetDraftCacheForTests();
    expect(readDraft("dm:0xabc")).toBe("");
  });

  it("keeps drafts apart by scope", () => {
    writeDraft("dm:0xaaa", "to A");
    writeDraft("dm:0xbbb", "to B");
    expect(readDraft("dm:0xaaa")).toBe("to A");
    expect(readDraft("dm:0xbbb")).toBe("to B");
  });

  it("ignores an empty key rather than storing under an empty string", () => {
    writeDraft("", "nowhere");
    expect(readDraft("")).toBe("");
    expect(storage.getString(STORAGE_KEY)).toBeUndefined();
  });

  it("forgets drafts older than the 30-day window", () => {
    const ancient = Date.now() - 31 * 24 * 60 * 60 * 1000;
    storage.set(
      STORAGE_KEY,
      JSON.stringify({ v: 1, w: ancient, d: { "dm:0xold": { t: "last month", u: ancient } } }),
    );
    __resetDraftCacheForTests();
    expect(readDraft("dm:0xold")).toBe("");
  });

  it("shrugs off a corrupt or foreign blob instead of throwing", () => {
    storage.set(STORAGE_KEY, "{not json");
    __resetDraftCacheForTests();
    expect(() => readDraft("dm:0xabc")).not.toThrow();
    expect(readDraft("dm:0xabc")).toBe("");

    storage.set(STORAGE_KEY, JSON.stringify({ v: 99, d: { "dm:0xabc": { t: "x", u: 1 } } }));
    __resetDraftCacheForTests();
    expect(readDraft("dm:0xabc")).toBe("");
  });

  it("notifies subscribers so the conversation list can show the draft", () => {
    const seen = jest.fn();
    const unsubscribe = subscribeDrafts(seen);
    writeDraft("dm:0xabc", "typing");
    expect(seen).toHaveBeenCalled();
    unsubscribe();
    seen.mockClear();
    writeDraft("dm:0xabc", "typing more");
    expect(seen).not.toHaveBeenCalled();
  });

  it("does not re-notify when the text has not actually changed", () => {
    writeDraft("dm:0xabc", "same");
    const seen = jest.fn();
    subscribeDrafts(seen);
    writeDraft("dm:0xabc", "same");
    expect(seen).not.toHaveBeenCalled();
  });

  it("caps a single draft so one runaway paste cannot eat the store", () => {
    writeDraft("dm:0xabc", "a".repeat(50_000));
    expect(readDraft("dm:0xabc").length).toBe(20_000);
  });

  it("keeps only the newest 120 scopes", () => {
    for (let i = 0; i < 130; i++) writeDraft(`dm:0x${i}`, `draft ${i}`);
    __resetDraftCacheForTests();
    const stored = JSON.parse(storage.getString(STORAGE_KEY) as string) as {
      d: Record<string, unknown>;
    };
    expect(Object.keys(stored.d).length).toBe(120);
    // The most recent write is always among the survivors — writes inside one
    // millisecond must not settle ties by insertion order.
    expect(readDraft("dm:0x129")).toBe("draft 129");
  });
});
