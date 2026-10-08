import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import ExportSheet from "../../components/editor/ExportSheet";

jest.mock("react-native-css-interop/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));
jest.mock("react-native", () => ({ Modal: "Modal", View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView", StyleSheet: { flatten: (s: unknown) => s } }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 48 }) }));
jest.mock("../../components/ui/Icon", () => "Icon");
jest.mock("../../components/editor/EditorPanels", () => ({
  Chip: ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => {
    const element = require("react").createElement;
    return element("Pressable", { accessibilityLabel: label, accessibilityRole: "button", accessibilityState: { selected: active }, onPress }, element("Text", null, label));
  },
}));

const props = () => ({ visible: true, width: 1920, height: 1080, pageCount: 3, timeline: { duration: 15, fps: 30 },
  ranges: { all: [], selected: [] }, video: null, busy: false, onCancel: jest.fn(), onExport: jest.fn(), onExportVideo: jest.fn(), onExportGif: jest.fn() });
it("defaults multi-page PNG to a ZIP and switches back to the current page for Photos/post", () => {
  const callbacks = props(), screen = render(<ExportSheet {...callbacks} />);
  expect(screen.queryByText("editor.app.postToDehub")).toBeNull();
  fireEvent.press(screen.getByText("common.save"));
  expect(callbacks.onExport).toHaveBeenLastCalledWith("png", "photos", "all");
  fireEvent.press(screen.getByLabelText("editor.pages.thisPage"));
  fireEvent.press(screen.getByText("editor.app.saveToPhotos"));
  expect(callbacks.onExport).toHaveBeenLastCalledWith("png", "photos", "current");
  fireEvent.press(screen.getByText("editor.app.postToDehub"));
  expect(callbacks.onExport).toHaveBeenLastCalledWith("png", "post", "current");
  fireEvent.press(screen.getByLabelText("editor.export.jpg"));
  fireEvent.press(screen.getByLabelText("editor.pages.allZip"));
  fireEvent.press(screen.getByText("common.save"));
  expect(callbacks.onExport).toHaveBeenLastCalledWith("jpeg", "photos", "all");
  expect(callbacks.onExportVideo).not.toHaveBeenCalled(); expect(callbacks.onExportGif).not.toHaveBeenCalled();
});
it("blocks export while busy and resets the page scope when reopened", () => {
  const callbacks = props(), screen = render(<ExportSheet {...callbacks} />);
  fireEvent.press(screen.getByLabelText("editor.pages.thisPage"));
  screen.rerender(<ExportSheet {...callbacks} visible={false} />);
  screen.rerender(<ExportSheet {...callbacks} busy />);
  fireEvent.press(screen.getByText("common.save"));
  expect(callbacks.onExport).not.toHaveBeenCalled();
  expect(screen.getByLabelText("editor.pages.allZip").props.accessibilityState.selected).toBe(true);
});
it("retains single-page exports and keeps a long sheet scrollable above the navigation bar", () => {
  const callbacks = props(), screen = render(<ExportSheet {...callbacks} pageCount={1} />);
  expect(screen.queryByLabelText("editor.pages.allZip")).toBeNull();
  fireEvent.press(screen.getByText("editor.app.saveToPhotos"));
  expect(callbacks.onExport).toHaveBeenCalledWith("png", "photos", "all");
  const scroll = screen.UNSAFE_getByType("ScrollView" as never);
  expect(scroll.props.style).toEqual({ flexShrink: 1 });
  expect(scroll.parent?.props.style).toMatchObject({ maxHeight: "90%", paddingBottom: 68 });
});
