import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import ScreenNavigator from "../../components/editor/ScreenNavigator";
import ScenesPanel from "../../components/editor/ScenesPanel";
import { pagePreviewTime } from "../../libs/editor/pages";
import type { TextClip } from "../../libs/editor/types";

jest.mock("react-native-css-interop/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));
jest.mock("react-native", () => ({ View: "View", Text: "Text", ScrollView: "ScrollView", Pressable: "Pressable", StyleSheet: { flatten: (style: unknown) => style } }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options: Record<string, unknown> = {}) => `${key}${options.number ? ` ${options.number}` : ""}` }) }));

const pages = [{ index: 0, start: 0, end: 3 }, { index: 1, start: 3, end: 7 }, { index: 2, start: 7, end: 10 }];
const clips = pages.map(page => ({ id: `headline-${page.index}`, kind: "text", trackId: "words", start: page.start, duration: page.end - page.start, text: `Screen ${page.index + 1}`, x: 0.5, y: 0.5, fontSize: 100, fontFamily: "Inter", fontWeight: 700, color: "#ffffff", align: "centre" })) as TextClip[];

it("makes every screen and the whole video preview reachable while a text layer is selected", () => {
  const onPick = jest.fn(), onEdit = jest.fn(), onPreview = jest.fn(), onTimeline = jest.fn();
  const view = render(<ScreenNavigator pages={pages} clips={clips} time={0.6} onPick={onPick} onEdit={onEdit} onPreview={onPreview} onTimeline={onTimeline} />);
  fireEvent.press(view.getByLabelText("editor.pages.page 2: Screen 2"));
  expect(onPick).toHaveBeenCalledWith(pages[1]);
  expect(pagePreviewTime(onPick.mock.calls[0][0])).toBe(3.6);
  fireEvent.press(view.getByText("editor.menu.editText")); expect(onEdit).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByText("editor.canvas.showTimeline")); expect(onTimeline).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByText("creator.preview · creator.navVideo")); expect(onPreview).toHaveBeenCalledTimes(1);
});

it("shows only the selected screen's words and opens the existing text editor", () => {
  const onEditText = jest.fn(), onPick = jest.fn();
  const view = render(<ScenesPanel pages={pages} clips={clips} current={1} onPick={onPick} onEditText={onEditText} onAdd={jest.fn()} onDelete={jest.fn()} />);
  expect(view.queryByText("Screen 1")).toBeNull();
  fireEvent.press(view.getByLabelText("editor.menu.editText: Screen 2")); expect(onEditText).toHaveBeenCalledWith("headline-1");
  fireEvent.press(view.getByText("editor.pages.page 3")); expect(onPick).toHaveBeenCalledWith(7);
});
