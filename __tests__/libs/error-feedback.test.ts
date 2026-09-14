/**
 * The rate-limit tell, and the once-per-burst rule.
 *
 * A spammed Follow button produces a run of 429s inside a second; the reader
 * should hear one tone and read one toast, not twenty of each.
 */
import {
  isRateLimitError,
  notifyRateLimited,
  reportActionError,
} from "../../libs/error-feedback";

const mockPlay = jest.fn();
const mockSeekTo = jest.fn();

jest.mock("expo-audio", () => ({
  createAudioPlayer: () => ({ play: mockPlay, seekTo: mockSeekTo, volume: 1 }),
}));

const mockToastError = jest.fn();
jest.mock("../../libs/toast", () => ({
  toastError: (...args: unknown[]) => mockToastError(...args),
}));

jest.mock("../../i18n", () => ({
  __esModule: true,
  default: { t: (_key: string, opts: { defaultValue: string }) => opts.defaultValue },
}));

describe("isRateLimitError", () => {
  it("reads the status the api client attaches", () => {
    expect(isRateLimitError(Object.assign(new Error("nope"), { status: 429 }))).toBe(true);
  });

  it("falls back to the message when there is no status", () => {
    expect(isRateLimitError(new Error("Too Many Requests"))).toBe(true);
    expect(isRateLimitError(new Error("429"))).toBe(true);
  });

  it("does not claim every failure", () => {
    expect(isRateLimitError(new Error("Network request failed"))).toBe(false);
    expect(isRateLimitError(Object.assign(new Error("x"), { status: 500 }))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
  });
});

describe("notifyRateLimited", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("sounds and speaks once per burst, then again after the window", () => {
    jest.setSystemTime(new Date("2026-09-14T00:00:00Z"));
    notifyRateLimited();
    notifyRateLimited();
    notifyRateLimited();
    expect(mockPlay).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockToastError.mock.calls[0][0]).toBe("Rate limited, slow down");

    jest.setSystemTime(new Date("2026-09-14T00:00:05Z"));
    notifyRateLimited();
    expect(mockPlay).toHaveBeenCalledTimes(2);
  });
});

describe("reportActionError", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-14T01:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps the caller's message for ordinary failures", () => {
    const err = new Error("boom");
    expect(reportActionError(err, "Couldn't follow")).toBe(false);
    expect(mockToastError).toHaveBeenCalledWith(err, "Couldn't follow");
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it("swaps a throttled failure for the slow-down notice", () => {
    expect(
      reportActionError(Object.assign(new Error("x"), { status: 429 }), "Couldn't follow"),
    ).toBe(true);
    expect(mockToastError).toHaveBeenCalledWith("Rate limited, slow down", "Rate limited, slow down", {
      duration: 2500,
    });
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });
});
