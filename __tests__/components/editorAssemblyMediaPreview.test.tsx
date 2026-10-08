import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import AssemblyMediaPreview from "../../components/editor/AssemblyMediaPreview";
import EditorCanvas from "../../components/editor/EditorCanvas";
import type { MediaClip, ProjectSnapshot } from "../../libs/editor/types";

jest.mock("react-native-css-interop/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));
jest.mock("react-native", () => ({ View: "View", Text: "Text", Modal: "Modal", Pressable: "Pressable",
  useWindowDimensions: () => ({ width: 400, height: 800 }), StyleSheet: { flatten: (style: unknown) => style } }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("../../components/editor/EditorCanvas", () => ({ __esModule: true, default: jest.fn(() => null) }));

it("plays a separate trimmed snapshot and never changes the original when interacting or replaying", () => {
  const clip: MediaClip = { id: "library", kind: "video", mediaId: "imported", trackId: "preview", start: 0, duration: 4, trimIn: 1 };
  const source: ProjectSnapshot = { id: "original", title: "Source", clips: [], tracks: [], updatedAt: 1,
    settings: { width: 640, height: 360, fps: 30, aspectPreset: "16:9", background: "#000", pages: [0, 5] } };
  const before = JSON.stringify(source), close = jest.fn();
  const screen = render(<AssemblyMediaPreview clip={clip} project={source} name="Actual imported video" onClose={close} />);
  const props = () => jest.mocked(EditorCanvas).mock.calls.at(-1)![0];
  expect(props().project.clips).toEqual([clip]); expect(props().project.id).not.toBe(source.id);
  expect(props().project.settings.pages).toBeUndefined(); expect(props().playing).toBe(true);
  act(() => { props().onLiveChange({ ...source, title: "Attempted edit" }); props().onGestureEnd(); props().onTime?.(3); props().onEnded?.(4); });
  expect(props().playing).toBe(false); expect(props().time).toBe(3);
  fireEvent.press(screen.getByLabelText("editor.shots.preview")); expect(props().time).toBe(0); expect(props().playing).toBe(true);
  fireEvent.press(screen.getByLabelText("common.cancel")); expect(close).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(source)).toBe(before);
});
