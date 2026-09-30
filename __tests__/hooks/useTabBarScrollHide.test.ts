import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderHook, act } from "@testing-library/react-native";

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  useSharedValue: (value: unknown) => jest.requireActual("react").useRef({ value }).current,
}));

// The bar's shared value, as TabBarHideProvider would hand it out.
const bar = { value: 0 };
jest.mock("../../context/TabBarHideContext", () => ({ useTabBarHide: () => bar }));

import { useTabBarScrollHide } from "../../hooks/useTabBarScrollHide";

const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

function setup() {
  bar.value = 0;
  return renderHook(() => ({ hide: bar, ...useTabBarScrollHide() }));
}

describe("useTabBarScrollHide", () => {
  let now = 10_000;
  beforeEach(() => {
    now = 10_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  const scrollTo = (drive: (y: number) => void, from: number, to: number) => {
    const step = from < to ? 20 : -20;
    for (let y = from + step; step > 0 ? y <= to : y >= to; y += step) drive(y);
  };

  it("hides on a scroll down and comes back on a scroll up", () => {
    const { result } = setup();
    act(() => scrollTo(result.current.drive, 0, 400));
    expect(result.current.hide!.value).toBeLessThan(-55);
    now += 1000;
    act(() => scrollTo(result.current.drive, 400, 300));
    expect(result.current.hide!.value).toBe(0);
  });

  it("always shows near the top", () => {
    const { result } = setup();
    act(() => scrollTo(result.current.drive, 0, 400));
    now += 1000;
    act(() => result.current.drive(380));
    act(() => result.current.drive(300));
    act(() => result.current.drive(240));
    act(() => result.current.drive(180));
    act(() => result.current.drive(120));
    act(() => result.current.drive(40));
    expect(result.current.hide!.value).toBe(0);
  });

  it("shows the bar again when the profile closes", () => {
    const { result, unmount } = setup();
    const hide = result.current.hide!;
    act(() => scrollTo(result.current.drive, 0, 400));
    unmount();
    expect(hide.value).toBe(0);
  });
});

describe("profile pages carry the home nav", () => {
  it("own profile renders the bar and drives it from every tab", () => {
    expect(read("screens/ProfileScreen.tsx").match(/<StandaloneTabBar \/>/g)).toHaveLength(2);
    const tabs = read("components/Profile/ProfileTabs.tsx");
    expect(tabs.match(/listHeader=\{listHeader\} onScroll=\{onScroll\}/g)).toHaveLength(10);
  });

  it("other people's profiles drive the bar, and the modal brings its own", () => {
    expect(read("components/UserProfile/UserProfileBottomContentTabs.tsx")).toContain("driveTabBar(y)");
    expect(read("components/UserProfile/UserProfileBottomSheet.tsx")).toContain(
      "<StandaloneTabBar onBeforeNavigate={onClose} />",
    );
  });
});
