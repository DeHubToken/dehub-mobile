import type { ProcessExitInfo } from "../../modules/exit-reason";

function exit(partial: Partial<ProcessExitInfo>): ProcessExitInfo {
  return {
    reason: 5,
    reasonName: "CRASH_NATIVE",
    description: null,
    timestamp: 1000,
    importance: 100,
    pss: 400 * 1024,
    rss: 600 * 1024,
    status: 0,
    trace: null,
    ...partial,
  };
}

describe("process exit reporting", () => {
  let exits: ProcessExitInfo[];
  let javaCrash: string | null;
  let processExit: typeof import("../../libs/processExit");

  beforeEach(() => {
    jest.resetModules();
    exits = [];
    javaCrash = null;
    jest.doMock("../../modules/exit-reason", () => ({
      getLastExitReasons: () => exits,
      takeLastJavaCrash: () => javaCrash,
    }));
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });
    require("../../libs/storage").storage.clearAll();
    processExit = require("../../libs/processExit");
  });

  it("keeps faults and drops exits the user or the system chose", () => {
    const { selectNewExits } = processExit;
    const all = [
      exit({ reasonName: "USER_REQUESTED", timestamp: 5 }),
      exit({ reasonName: "LOW_MEMORY", timestamp: 4 }),
      exit({ reasonName: "ANR", timestamp: 3 }),
      exit({ reasonName: "EXIT_SELF", timestamp: 2 }),
      exit({ reasonName: "CRASH_NATIVE", timestamp: 1 }),
    ];
    expect(selectNewExits(all, 0).map((e) => e.reasonName)).toEqual(["LOW_MEMORY", "ANR", "CRASH_NATIVE"]);
  });

  it("reports only what is newer than the last launch saw", async () => {
    exits = [
      exit({ reasonName: "CRASH_NATIVE", timestamp: 2000, description: "SIGSEGV", trace: "signal 11 (SIGSEGV)\n#00 pc ..." }),
      exit({ reasonName: "LOW_MEMORY", timestamp: 1000 }),
    ];
    processExit.reportProcessExits();
    const reporter = require("../../libs/errorReporter") as typeof import("../../libs/errorReporter");
    await reporter.flushLogs();

    const rows = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).logs;
    expect(rows.map((r: any) => r.component)).toEqual(["ProcessExit", "ProcessExit"]);
    expect(rows[0].message).toBe("Process ended: CRASH_NATIVE — SIGSEGV");
    const detail = JSON.parse(rows[0].metadata.detail);
    expect(detail.pssMb).toBe(400);
    expect(detail.trace).toContain("SIGSEGV");

    // Next launch: the same history, nothing new.
    (global.fetch as jest.Mock).mockClear();
    processExit.reportProcessExits();
    await reporter.flushLogs();
    expect(global.fetch).not.toHaveBeenCalled();

    // A fresh exit after that is reported alone.
    exits = [exit({ reasonName: "ANR", timestamp: 3000 }), ...exits];
    processExit.reportProcessExits();
    await reporter.flushLogs();
    const next = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).logs;
    expect(next).toHaveLength(1);
    expect(next[0].message).toBe("Process ended: ANR");
  });

  it("ships the saved Java stack as its own row, with the exception as the headline", async () => {
    javaCrash = [
      "thread=main",
      "time=1700000000000",
      "java.lang.IllegalStateException: Trying to add unknown view tag: 4711",
      "\tat com.facebook.react.uimanager.NativeViewHierarchyManager.addRootView(NativeViewHierarchyManager.java:100)",
    ].join("\n");
    processExit.reportProcessExits();
    const reporter = require("../../libs/errorReporter") as typeof import("../../libs/errorReporter");
    await reporter.flushLogs();

    const rows = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).logs;
    const row = rows.find((r: any) => r.component === "JavaCrash");
    expect(row.message).toBe("java.lang.IllegalStateException: Trying to add unknown view tag: 4711");
    expect(row.stack_trace).toContain("NativeViewHierarchyManager.addRootView");
  });

  it("is silent where the native module is missing", () => {
    jest.resetModules();
    jest.dontMock("../../modules/exit-reason");
    const real = require("../../libs/processExit") as typeof import("../../libs/processExit");
    expect(() => real.reportProcessExits()).not.toThrow();
  });
});
