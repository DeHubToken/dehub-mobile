function body(call: any) {
  return JSON.parse(call[1].body);
}

/**
 * The queue is mirrored to disk on every report, so a process killed from
 * underneath JavaScript — a native crash, an OOM — does not take unsent rows
 * with it. The next launch drains the mirror.
 */
describe("error reporter, queue mirror", () => {
  let reporter: typeof import("../../libs/errorReporter");
  let asyncStorage: typeof import("@react-native-async-storage/async-storage").default;

  beforeEach(() => {
    jest.resetModules();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });
    asyncStorage = require("@react-native-async-storage/async-storage").default;
    reporter = require("../../libs/errorReporter");
  });

  async function settle() {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  }

  it("mirrors queued rows to disk before they are sent", async () => {
    reporter.reportError("ProcessExit", ["Process ended: CRASH_NATIVE"]);
    await settle();

    const mirror = await asyncStorage.getItem("error_reporter_queue_v1");
    expect(mirror).toContain("CRASH_NATIVE");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("clears the mirror once the rows have gone", async () => {
    reporter.reportError("Feed", ["one"]);
    await reporter.flushLogs();
    expect(await asyncStorage.getItem("error_reporter_queue_v1")).toBeNull();
  });

  it("drains the mirror on the next launch, once", async () => {
    reporter.reportError("ProcessExit", ["Process ended: LOW_MEMORY"]);
    await settle();
    // The process dies here without flushing.

    jest.resetModules();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });
    const next = require("../../libs/errorReporter") as typeof reporter;
    await next.drainPersistedLogs();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(body((global.fetch as jest.Mock).mock.calls[0]).logs[0].message).toContain("LOW_MEMORY");
    expect(await asyncStorage.getItem("error_reporter_queue_v1")).toBeNull();

    (global.fetch as jest.Mock).mockClear();
    await next.drainPersistedLogs();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
