import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
jest.mock("react-native-css-interop/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));
jest.mock("react-native", () => ({ View: "View", Keyboard: { dismiss: jest.fn() } }));
jest.mock("react-native-reanimated", () => ({ useSharedValue: (value: number) => jest.requireActual("react").useRef({ value }).current }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const mockNavigate = jest.fn();
const mockCanGoBack = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate, canGoBack: mockCanGoBack }),
}));
let mockSourceTab = "video";
const mockItems = [
  { postType: "all" }, { postType: "short" }, { postType: "feed-images" },
  { postType: "video" }, { postType: "feed-audio" }, { postType: "live" },
];
jest.mock("../../libs/eventBus", () => ({
  homeTabEvents: { visibleTab: () => mockSourceTab },
}));
jest.mock("../../components/Home/FeedNavBar", () => ({
  __esModule: true, default: "FeedNavBar", useFeedNavItems: () => mockItems,
}));
import PostFeedNav from "../../components/Home/PostFeedNav";

const render = () => {
  const onBack = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<PostFeedNav onBack={onBack} />); });
  return { tree, onBack, nav: tree.root.findByType("FeedNavBar" as any) };
};

beforeEach(() => {
  mockNavigate.mockClear();
  mockCanGoBack.mockReturnValue(true);
  mockSourceTab = "video";
});

it("keeps the full feed pill with the source tab selected and Back in the filter slot", () => {
  const { tree, nav, onBack } = render();
  expect(nav.props.activeIndex).toBe(3);
  expect(nav.props.backMode).toBe(true);
  expect(nav.props.backLabel).toBe("common.goBack");
  act(() => nav.props.onBackPress());
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(mockNavigate).not.toHaveBeenCalled();
  act(() => tree.unmount());
});

it("returns any pill tab to the existing Home rather than stacking another Root", () => {
  const { tree, nav } = render();
  act(() => nav.props.onPostTypeChange("feed-images"));
  expect(mockNavigate).toHaveBeenCalledWith({
    name: "Root",
    params: { screen: "Home", params: { feedTab: "feed-images", openFeedFilters: false } },
    pop: true,
  });
  act(() => tree.unmount());
});

it("opens the source tab's filters on long press", () => {
  const { tree, nav } = render();
  act(() => nav.props.onActiveTabLongPress());
  expect(mockNavigate).toHaveBeenCalledWith({
    name: "Root",
    params: { screen: "Home", params: { feedTab: "video", openFeedFilters: true } },
    pop: true,
  });
  act(() => tree.unmount());
});

it("gives a directly opened post a working exit when there is no stack to pop", () => {
  mockCanGoBack.mockReturnValue(false);
  const { tree, nav, onBack } = render();
  act(() => nav.props.onBackPress());
  expect(onBack).not.toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ name: "Root", pop: true }));
  act(() => tree.unmount());
});

it("falls back to Home if the saved source tab is no longer available", () => {
  mockSourceTab = "removed-tab";
  const { tree, nav } = render();
  expect(nav.props.activeIndex).toBe(0);
  act(() => nav.props.onActiveTabLongPress());
  expect(mockNavigate.mock.calls[0][0].params.params.feedTab).toBe("all");
  act(() => tree.unmount());
});
