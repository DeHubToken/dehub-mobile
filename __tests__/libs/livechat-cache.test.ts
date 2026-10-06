import { readRecentChat, replyQuoteText, writeRecentChat } from "../../libs/livechat-cache";
import type { LiveChatMessageData } from "../../services/livechat.service";

const t = ((key: string) => ({
  "liveChat.photo": "Photo",
  "liveChat.attachGif": "GIF",
  "publicChatAlerts.voiceMessage": "Voice message",
}[key] ?? key)) as any;

const msg = (id: string, extra: Partial<LiveChatMessageData> = {}): LiveChatMessageData => ({
  _id: id,
  roomId: "global",
  senderAddress: "0xabc",
  content: `line ${id}`,
  messageType: "text",
  createdAt: "2026-10-06T12:00:00.000Z",
  ...extra,
});

describe("recent public chat", () => {
  it("round-trips the last fifty lines", () => {
    const lines = Array.from({ length: 80 }, (_, i) => msg(String(i).padStart(24, "0")));
    writeRecentChat(undefined, lines);
    const back = readRecentChat();
    expect(back).toHaveLength(50);
    expect(back[0]._id).toBe(lines[30]._id);
    expect(back[49]._id).toBe(lines[79]._id);
  });

  it("reads nothing rather than throwing on a bad entry", () => {
    const { storage } = require("../../libs/storage");
    storage.set("livechat:recent:global", "{not json");
    expect(readRecentChat()).toEqual([]);
    storage.set("livechat:recent:global", JSON.stringify([{ nope: 1 }, msg("a")]));
    expect(readRecentChat().map((m) => m._id)).toEqual(["a"]);
  });
});

describe("replyQuoteText", () => {
  it("quotes the original text", () => {
    expect(replyQuoteText(msg("r", { replyTo: { _id: "o", content: "gm", senderAddress: "0x1" } }), t)).toBe("gm");
    expect(replyQuoteText(msg("r", { replyToContent: "legacy" }), t)).toBe("legacy");
  });

  it("labels a reply to a photo, GIF or voice note instead of dropping the quote", () => {
    const reply = (messageType: string) =>
      msg("r", { replyTo: { _id: "o", content: "", senderAddress: "0x1", messageType } });
    expect(replyQuoteText(reply("media"), t)).toBe("Photo");
    expect(replyQuoteText(reply("gif"), t)).toBe("GIF");
    expect(replyQuoteText(reply("audio"), t)).toBe("Voice message");
  });
});
