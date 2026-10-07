import {
  __resetNavigationTimingForTests,
  flushNavigationTiming,
  markNavigationSettled,
  reportLaunchRevealed,
  summarizeNavigation,
  trackNavigationTiming,
} from "../../libs/launchTiming";

jest.mock("../../libs/errorReporter", () => ({ reportError: jest.fn() }));
const { reportError } = jest.requireMock("../../libs/errorReporter") as { reportError: jest.Mock };

const flushFrames = () => {
  jest.runOnlyPendingTimers();
  jest.runOnlyPendingTimers();
};

describe("launch timing", () => {
  it("reports one cold start per JavaScript start", () => {
    reportLaunchRevealed({ signedIn: true });
    reportLaunchRevealed({ signedIn: true });
    expect(reportError).toHaveBeenCalledTimes(1);
    const [component, args, options] = reportError.mock.calls[0];
    expect(component).toBe("LaunchTiming");
    expect(args).toEqual(["cold start"]);
    expect(options.level).toBe("info");
    expect(options.metadata).toMatchObject({ signedIn: true });
    expect(options.metadata.jsToRevealMs).toBeGreaterThanOrEqual(0);
  });
});

describe("navigation timing", () => {
  let actionListener: (e: { data?: { noop?: boolean } }) => void = () => {};
  const ref = { addListener: jest.fn((_t: string, cb: any) => { actionListener = cb; return () => {}; }) };

  beforeEach(() => {
    jest.useFakeTimers();
    reportError.mockClear();
    __resetNavigationTimingForTests();
    trackNavigationTiming(ref as any);
    markNavigationSettled({ key: "home-1", name: "Home" });
  });
  afterEach(() => jest.useRealTimers());

  const navigate = (key: string, name: string, noop = false) => {
    actionListener({ data: { noop } });
    markNavigationSettled({ key, name });
    flushFrames();
  };

  it("times a dispatched navigation to its new screen", () => {
    navigate("post-1", "FeedDetail");
    flushNavigationTiming();
    expect(reportError).toHaveBeenCalledTimes(1);
    const [component, , options] = reportError.mock.calls[0];
    expect(component).toBe("NavigationTiming");
    expect(options.metadata).toMatchObject({ n: 1, routes: [expect.objectContaining({ route: "FeedDetail", n: 1 })] });
  });

  it("ignores no-op actions and changes that keep the same screen", () => {
    navigate("home-1", "Home");
    actionListener({ data: { noop: true } });
    markNavigationSettled({ key: "profile-1", name: "Profile" });
    flushFrames();
    flushNavigationTiming();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("sends a summary every 25 navigations", () => {
    for (let i = 0; i < 25; i++) navigate(`p-${i}`, i % 2 ? "Profile" : "FeedDetail");
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][2].metadata.n).toBe(25);
  });

  it('keeps slow foreground navigation in the summary', () => {
    actionListener({ data: {} });
    jest.advanceTimersByTime(12_000);
    markNavigationSettled({ key: 'slow', name: 'Home' });
    flushFrames();
    flushNavigationTiming();
    expect(reportError.mock.calls[0][2].metadata.max).toBeGreaterThanOrEqual(12_000);
  });

  it('discards unfinished frame samples when the app backgrounds', () => {
    actionListener({ data: {} });
    markNavigationSettled({ key: 'pending', name: 'Profile' });
    flushNavigationTiming();
    flushFrames();
    flushNavigationTiming();
    expect(reportError).not.toHaveBeenCalled();
  });
});

describe("summarizeNavigation", () => {
  it("gives percentiles overall and per route, busiest first", () => {
    const batch = [
      ...[100, 200, 300, 400].map((ms) => ({ route: "FeedDetail", ms })),
      ...[1000, 50].map((ms) => ({ route: "Profile", ms })),
    ];
    const s = summarizeNavigation(batch);
    expect(s).toMatchObject({ n: 6, p50: 300, max: 1000 });
    expect(s.routes[0]).toEqual({ route: "FeedDetail", n: 4, p50: 300, max: 400 });
    expect(s.routes[1]).toEqual({ route: "Profile", n: 2, p50: 1000, max: 1000 });
  });

  it("keeps the summary inside the log metadata cap", () => {
    const batch = Array.from({ length: 200 }, (_, i) => ({ route: `RouteWithALongishName${i}`, ms: i }));
    expect(JSON.stringify(summarizeNavigation(batch)).length).toBeLessThan(4000);
  });
});
