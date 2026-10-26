import { newWidget } from "../../libs/live-overlay/registry";
import type { OverlayWidget } from "../../libs/live-overlay/types";
import {
  ALERT_GAP_MS,
  AlertQueue,
  MAX_WAITING,
  WidgetBoard,
  drawingsKey,
  formatElapsed,
  isPaintedKind,
  type PlacedDrawing,
} from "../../libs/phone-studio/widgets";

/** Echoes the key and its options, so assertions read the wording that was asked for. */
const t = (key: string, opts?: Record<string, unknown>) =>
  opts && Object.keys(opts).length ? `${key}:${JSON.stringify(opts)}` : key;

function widget(kind: Parameters<typeof newWidget>[0], settings: Record<string, unknown> = {}, extra: Partial<OverlayWidget> = {}): OverlayWidget {
  const w = newWidget(kind, []);
  return { ...w, id: `${kind}-x`, settings: { ...w.settings, ...settings }, ...extra };
}

function board(widgets: OverlayWidget[], stats = { totalTips: 0, followers: 0 }) {
  const b = new WidgetBoard(t, 0);
  b.setOverlay(widgets, stats);
  return b;
}

const find = (drawings: PlacedDrawing[], id: string) => drawings.find((d) => d.id === id)?.drawing;

describe("AlertQueue", () => {
  it("shows one alert at a time, each for its duration, with a gap between", () => {
    const q = new AlertQueue<string>();
    q.push("a", 2000, 0);
    q.push("b", 2000, 10);
    expect(q.at(0)).toBe("a");
    expect(q.at(1999)).toBe("a");
    expect(q.at(2000)).toBeNull();
    expect(q.at(2000 + ALERT_GAP_MS - 1)).toBeNull();
    expect(q.at(2000 + ALERT_GAP_MS)).toBe("b");
  });

  it("holds every alert at least 1.5 seconds", () => {
    const q = new AlertQueue<string>();
    q.push("a", 10, 0);
    expect(q.at(1499)).toBe("a");
    expect(q.at(1500)).toBeNull();
  });

  it("drops the oldest waiting alert past the cap", () => {
    const q = new AlertQueue<number>();
    q.push(-1, 1500, 0); // on screen
    for (let i = 0; i <= MAX_WAITING; i++) q.push(i, 1500, 0);
    // 0 was dropped; 1 is next.
    expect(q.at(1500 + ALERT_GAP_MS)).toBe(1);
  });
});

describe("WidgetBoard", () => {
  it("skips kinds it cannot paint", () => {
    expect(isPaintedKind("poll")).toBe(false);
    expect(isPaintedKind("goal_bar")).toBe(true);
    const b = board([widget("poll"), widget("viewer_count")]);
    expect(b.frame(0, true).map((d) => d.id)).toEqual(["viewer_count-x"]);
  });

  it("skips disabled widgets and draws in z order", () => {
    const b = board([
      widget("viewer_count", {}, { z: 5 }),
      widget("stream_timer", {}, { z: 1 }),
      widget("goal_bar", {}, { enabled: false }),
    ]);
    expect(b.frame(0, true).map((d) => d.id)).toEqual(["stream_timer-x", "viewer_count-x"]);
  });

  it("uses the portrait rectangle for a portrait frame", () => {
    const w = widget("viewer_count");
    const b = board([w]);
    expect(b.frame(0, true)[0].rect).toEqual(w.portrait);
    expect(b.frame(0, false)[0].rect).toEqual(w.landscape);
  });

  it("shows a follow alert for its duration", () => {
    const b = board([widget("follow_alert", { durationMs: 3000 })]);
    expect(b.frame(0, true)).toEqual([]);
    b.publish({ type: "follow", user: { displayName: "Ada" } }, 100);
    const shown = find(b.frame(200, true), "follow_alert-x");
    expect(shown).toMatchObject({ type: "banner", initial: "A" });
    expect((shown as any).title).toContain("liveOverlay.newFollower");
    expect((shown as any).title).toContain("Ada");
    expect(b.frame(3200, true)).toEqual([]);
  });

  it("announces each joining viewer once", () => {
    const b = board([widget("join_alert", { durationMs: 1500 })]);
    b.publish({ type: "join", user: { address: "0xa", username: "a" } }, 0);
    b.publish({ type: "join", user: { address: "0xa", username: "a" } }, 0);
    expect(find(b.frame(10, true), "join_alert-x")).toBeTruthy();
    expect(b.frame(1500 + ALERT_GAP_MS + 10, true)).toEqual([]);
  });

  it("holds back alerts while the creator has paused them, but keeps counters", () => {
    const b = new WidgetBoard(t, 0);
    b.setOverlay([widget("follow_alert"), widget("viewer_count")], { totalTips: 0, followers: 0 }, {
      alertsPaused: true,
      soundsMuted: false,
      readAloudMuted: false,
    });
    b.publish({ type: "follow", user: { displayName: "Ada" } }, 0);
    expect(b.frame(10, true).map((d) => d.id)).toEqual(["viewer_count-x"]);
  });

  it("shows a tip banner, honouring the minimum and hiding the message when asked", () => {
    const b = board([widget("tip_alert", { minAmount: 100, showMessage: false })]);
    b.publish({ type: "tip", amount: 50, user: { displayName: "Low" } }, 0);
    expect(b.frame(10, true)).toEqual([]);
    b.publish({ type: "tip", amount: 500, user: { displayName: "Big" }, message: "hello" }, 20);
    const shown = find(b.frame(30, true), "tip_alert-x") as any;
    expect(shown.type).toBe("banner");
    expect(shown.title).toBe("Big");
    expect(shown.detail).toContain("500");
    expect(shown.message).toBeUndefined();
  });

  it("waits for the payment when the tip alert is confirmed-only", () => {
    const b = board([widget("tip_alert", { confirmedOnly: true })]);
    b.publish({ type: "tip", amount: 500, user: { displayName: "Ada" }, transactionHash: "0xh" }, 0);
    expect(b.frame(10, true)).toEqual([]);
    b.publish({ type: "tipConfirmed", paidAmount: 400, address: "0xa", transactionHash: "0xh" }, 20);
    expect((find(b.frame(30, true), "tip_alert-x") as any).detail).toContain("400");
  });

  it("moves a tips goal on confirmed tips only, and resets the delta when the server catches up", () => {
    const b = board([widget("goal_bar", { metric: "tips", target: 1000 })], { totalTips: 100, followers: 0 });
    b.publish({ type: "tip", amount: 999, user: {} }, 0);
    expect((find(b.frame(0, true), "goal_bar-x") as any).progress).toBeCloseTo(0.1);
    b.publish({ type: "tipConfirmed", paidAmount: 200, address: "", transactionHash: "" }, 0);
    expect((find(b.frame(0, true), "goal_bar-x") as any).progress).toBeCloseTo(0.3);
    b.setOverlay([widget("goal_bar", { metric: "tips", target: 1000 })], { totalTips: 300, followers: 0 });
    expect((find(b.frame(0, true), "goal_bar-x") as any).progress).toBeCloseTo(0.3);
  });

  it("says the goal is reached and caps the bar", () => {
    const b = board([widget("goal_bar", { metric: "followers", target: 2 })], { totalTips: 0, followers: 1 });
    b.publish({ type: "follow", user: {} }, 0);
    b.publish({ type: "follow", user: {} }, 0);
    const goal = find(b.frame(0, true), "goal_bar-x") as any;
    expect(goal.progress).toBe(1);
    expect(goal.title).toBe("liveOverlay.goalReached");
    expect(goal.coin).toBe(false);
  });

  it("counts viewers from the room", () => {
    const b = board([widget("viewer_count")]);
    b.publish({ type: "viewers", count: 1234 }, 0);
    expect((find(b.frame(0, true), "viewer_count-x") as any).value).toBe((1234).toLocaleString());
  });

  it("times the stream from the server's start, else the broadcast's", () => {
    const b = board([widget("stream_timer")]);
    b.setStreamStartedAt(1_000);
    expect((find(b.frame(66_000, true), "stream_timer-x") as any).value).toBe("1:05");
    b.setOverlay([widget("stream_timer")], { totalTips: 0, followers: 0, startedAt: new Date(0).toISOString() });
    expect((find(b.frame(3_600_000, true), "stream_timer-x") as any).value).toBe("1:00:00");
  });

  it("lists top supporters up to the count", () => {
    const b = board([widget("top_supporters", { count: 2 })]);
    b.setSupporters([
      { address: "a", displayName: "A", total: 30 },
      { address: "b", username: "b", total: 20 },
      { address: "c", total: 10 },
    ]);
    const list = find(b.frame(0, true), "top_supporters-x") as any;
    expect(list.slots).toBe(2);
    expect(list.rows.map((r: any) => r.name)).toEqual(["A", "b"]);
    expect(list.rows[0].rank).toBe("1");
  });

  it("shows the newest chat lines and nothing when the chat is empty", () => {
    const b = board([widget("chat_box", { count: 2 })]);
    expect(b.frame(0, true)).toEqual([]);
    b.setChat([
      { id: "1", text: "one", user: { username: "a" } },
      { id: "2", text: "two", user: { username: "b" } },
      { id: "3", text: "three", user: {} },
    ]);
    const chat = find(b.frame(0, true), "chat_box-x") as any;
    expect(chat.lines).toEqual([
      { name: "b", text: "two" },
      { name: "liveOverlay.someone", text: "three" },
    ]);
  });

  it("draws text only when there is some, and a ticker that moves", () => {
    const b = board([widget("text", { text: "", subtext: "" }), widget("ticker", { text: "Hello", speed: "fast" })]);
    const first = b.frame(0, true);
    expect(first.map((d) => d.id)).toEqual(["ticker-x"]);
    const later = b.frame(2_500, true);
    expect((find(later, "ticker-x") as any).phase).toBeCloseTo(0.25, 2);
    expect(drawingsKey(first)).not.toBe(drawingsKey(later));
  });

  it("keeps the key steady while nothing changes", () => {
    const b = board([widget("viewer_count"), widget("goal_bar")]);
    expect(drawingsKey(b.frame(0, true))).toBe(drawingsKey(b.frame(900, true)));
  });

  it("lists paid tips and follows in the event feed, newest first", () => {
    const b = board([widget("event_feed", { count: 2 })]);
    b.publish({ type: "follow", user: { displayName: "F" } }, 0);
    b.publish({ type: "tipConfirmed", paidAmount: 50, address: "0xa", transactionHash: "h", user: { displayName: "T" } }, 0);
    b.publish({ type: "share", user: { displayName: "S" } }, 0);
    const feed = find(b.frame(0, true), "event_feed-x") as any;
    expect(feed.rows).toHaveLength(2);
    expect(feed.rows[0].name).toContain("liveOverlay.shared");
    expect(feed.rows[1].value).toBe("50");
  });
});

describe("formatElapsed", () => {
  it("drops the hour until there is one", () => {
    expect(formatElapsed(59_000)).toBe("0:59");
    expect(formatElapsed(3_661_000)).toBe("1:01:01");
    expect(formatElapsed(-5)).toBe("0:00");
  });
});
