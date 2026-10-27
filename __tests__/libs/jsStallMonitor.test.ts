import { AppState } from "react-native";
import { __resetJsStallMonitorForTests, flushStalls, installJsStallMonitor, summarizeStalls } from "../../libs/jsStallMonitor";

jest.mock("../../libs/errorReporter", () => ({ reportError: jest.fn() }));
const { reportError } = jest.requireMock("../../libs/errorReporter") as { reportError: jest.Mock };

describe("js stall monitor", () => {
  let clock = 0;
  let listeners: Record<string, (s?: any) => void> = {};

  beforeEach(() => {
    jest.useFakeTimers();
    reportError.mockClear();
    __resetJsStallMonitorForTests();
    clock = 0;
    listeners = {};
    (globalThis as any).performance = { now: () => clock };
    jest.spyOn(AppState, "addEventListener").mockImplementation(((type: string, cb: any) => {
      listeners[type] = cb;
      return { remove: () => { delete listeners[type]; } };
    }) as any);
    Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
  });
  afterEach(() => jest.useRealTimers());

  const tick = (elapsed: number) => {
    clock += elapsed;
    jest.advanceTimersByTime(250);
  };

  it("ignores normal ticks and reports late ones with their screen", () => {
    installJsStallMonitor(() => "Home", () => ({ theme: "hazy" }));
    tick(260);
    tick(250 + 1500);
    flushStalls();
    expect(reportError).toHaveBeenCalledTimes(1);
    const [component, , options] = reportError.mock.calls[0];
    expect(component).toBe("JsStall");
    expect(options.metadata).toMatchObject({ n: 1, max: 1500, theme: "hazy", routes: [{ route: "Home", n: 1, max: 1500 }] });
  });

  it("does not count time spent in the background", () => {
    installJsStallMonitor(() => "Home");
    listeners.change("background");
    clock += 60_000;
    listeners.change("active");
    tick(250);
    flushStalls();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports memory warnings a few times per session", () => {
    installJsStallMonitor(() => "Shorts");
    for (let i = 0; i < 5; i++) listeners.memoryWarning();
    expect(reportError).toHaveBeenCalledTimes(3);
    expect(reportError.mock.calls[0][0]).toBe("MemoryWarning");
    expect(reportError.mock.calls[0][2].metadata.route).toBe("Shorts");
  });

  it("summarizes by route", () => {
    expect(summarizeStalls([{ ms: 800, route: "A" }, { ms: 2000, route: "B" }, { ms: 900, route: "A" }])).toMatchObject({
      n: 3, max: 2000, totalMs: 3700, routes: [{ route: "A", n: 2, max: 900 }, { route: "B", n: 1, max: 2000 }],
    });
  });
});
