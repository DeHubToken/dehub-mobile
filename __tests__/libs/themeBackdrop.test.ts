import { holdThemeBackdrop, isThemeBackdropVisible, setThemeBackdropVisible, subscribeThemeBackdrop } from "../../libs/themeBackdrop";

describe("theme backdrop hold", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("pauses on a drag and lapses on its own, extended by each new drag", () => {
    setThemeBackdropVisible(true);
    const fn = jest.fn();
    const off = subscribeThemeBackdrop(fn);
    holdThemeBackdrop();
    expect(isThemeBackdropVisible()).toBe(false);
    jest.advanceTimersByTime(1000);
    holdThemeBackdrop();
    jest.advanceTimersByTime(1000);
    expect(isThemeBackdropVisible()).toBe(false);
    jest.advanceTimersByTime(600);
    expect(isThemeBackdropVisible()).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
    off();
  });
});
