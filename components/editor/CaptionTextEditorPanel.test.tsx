import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import CaptionTextEditorPanel from "./CaptionTextEditorPanel";
import { useProjectHistory } from "../../libs/editor/useProjectHistory";
import { applyCaptionText } from "../../libs/editor/captionText";
import { subtitleLayers } from "../../libs/editor/subtitles";
import { DEFAULT_SETTINGS } from "../../libs/editor/types";

jest.mock("react-native-css-interop/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));
jest.mock("react-native", () => ({ View: "View", Text: "Text", TextInput: "TextInput", Pressable: "Pressable", Platform: { OS: "ios" }, StyleSheet: { flatten: (style: unknown) => style } }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key).replace("{{total}}", String(options?.total ?? "")) }) }));
function setup() {
  let id = 0;
  const layers = subtitleLayers([{ start: 0, end: 1, text: "Hello" }, { start: 1, end: 2, text: "Hello again" }], () => `c${++id}`);
  const snapshot = { id: "caption-text-ui", title: "Captions", updatedAt: 1, settings: DEFAULT_SETTINGS, tracks: [layers.track], clips: layers.clips };
  const seek = jest.fn();
  let history!: ReturnType<typeof useProjectHistory>;
  function Harness() {
    const h = useProjectHistory(snapshot); history = h;
    return <CaptionTextEditorPanel project={h.project!} disabled={h.isEditing()} onSeek={seek} onApply={plan => {
      const current = h.latest(); if (!current || h.isEditing()) return false;
      const next = applyCaptionText(current, plan); if (next !== current) h.commit(next); return true;
    }} />;
  }
  const view = render(<Harness />);
  fireEvent.press(view.getByText("Edit captions · 2"));
  return { ...view, seek, history: () => history };
}
it("corrects repeated wording through the native UI with one actual Undo", async () => {
  const view = setup();
  fireEvent.changeText(view.getByLabelText("Find in captions"), "Hello");
  fireEvent.changeText(view.getByLabelText("Replace with"), "Hi");
  fireEvent.press(view.getByText("Replace in 2 captions"));
  await waitFor(() => expect(view.getByText("Caption changes saved.")).toBeTruthy());
  expect(view.history().latest()?.clips).toMatchObject([{ text: "Hi" }, { text: "Hi again" }]);
  act(() => { view.history().undo(); });
  expect(view.history().latest()?.clips).toMatchObject([{ text: "Hello" }, { text: "Hello again" }]);
  expect(view.history().canUndo).toBe(false);
  view.unmount();
});
it("rejects a draft made stale by another native edit", () => {
  const view = setup();
  fireEvent.press(view.getByText("Hello again"));
  fireEvent.changeText(view.getByLabelText("Caption text"), "Corrected");
  act(() => {
    const current = view.history().latest()!;
    view.history().commit({ ...current, clips: [current.clips[0], { ...current.clips[1], start: 3 }] });
  });
  expect(view.getByText("Captions changed. Reload the line before saving.")).toBeTruthy();
  fireEvent.press(view.getByText("Save caption"));
  expect(view.history().latest()?.clips[1]).toMatchObject({ start: 3, text: "Hello again" });
  view.unmount();
});
it("seeks and saves one multiline caption while preserving its duration and style", async () => {
  const view = setup(), original = view.history().latest()!.clips[1];
  fireEvent.press(view.getByText("Hello again"));
  expect(view.seek).toHaveBeenCalledWith(original);
  fireEvent.changeText(view.getByLabelText("Caption text"), "Corrected\ncaption");
  fireEvent.press(view.getByText("Save caption"));
  await waitFor(() => expect(view.getByText("Caption changes saved.")).toBeTruthy());
  expect(view.history().latest()?.clips[1]).toEqual({ ...original, text: "Corrected\ncaption" });
  act(() => { view.history().undo(); });
  expect(view.history().latest()?.clips[1]).toEqual(original);
  expect(view.history().canUndo).toBe(false);
  view.unmount();
});
