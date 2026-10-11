import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import CaptionTranslationPanel from "./CaptionTranslationPanel";
import { translateText } from "../../services/translation.service";
import { subtitleLayers } from "../../libs/editor/subtitles";
import { DEFAULT_SETTINGS } from "../../libs/editor/types";
import { projectEditGate } from "../../libs/editor/projectEditGate";
import type { CaptionTranslationPlan, CaptionTranslationUpdate } from "../../libs/editor/captionTranslation";

jest.mock("react-native-css-interop/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));
jest.mock("../../services/translation.service", () => ({ translateText: jest.fn() }));
jest.mock("../../i18n", () => ({ SUPPORTED_LANGUAGES: [{ code: "en", name: "English", nativeName: "English" }] }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: { defaultValue?: string; count?: number }) => (options?.defaultValue ?? key).replace("{{count}}", String(options?.count ?? "")) }) }));

beforeEach(() => { jest.mocked(translateText).mockReset(); });
function setup() {
  let id = 0;
  const layers = subtitleLayers([{ start: 0, end: 1, text: "Hello" }, { start: 1, end: 2, text: "World" }], () => `c${++id}`);
  const project = { id: "caption-ui", title: "Captions", updatedAt: 1, settings: DEFAULT_SETTINGS, tracks: [layers.track], clips: layers.clips };
  const gate = projectEditGate(() => {}), onApply = jest.fn((_plan: CaptionTranslationPlan, _updates: CaptionTranslationUpdate[]) => true);
  const view = render(<CaptionTranslationPanel project={project} disabled={false} onBusyChange={() => {}} current={() => project} subscribe={() => () => {}} onStart={() => gate.hold()} onApply={onApply} />);
  return { ...view, gate, onApply, project };
}
it("uses private translation options and submits one complete result", async () => {
  jest.mocked(translateText).mockResolvedValueOnce({ translatedText: "Bonjour", sourceLang: "en", sameLanguage: false }).mockResolvedValueOnce({ translatedText: "Monde", sourceLang: "en", sameLanguage: false });
  const view = setup();
  fireEvent.press(view.getByText("Translate 2 captions"));
  await waitFor(() => expect(view.onApply).toHaveBeenCalledTimes(1));
  expect(translateText).toHaveBeenNthCalledWith(1, "Hello", "en", "auto", { isPublic: false });
  expect(translateText).toHaveBeenNthCalledWith(2, "World", "en", "auto", { isPublic: false });
  expect(view.onApply.mock.calls[0][1]).toEqual([{ id: view.project.clips[0].id, text: "Bonjour" }, { id: view.project.clips[1].id, text: "Monde" }]);
  expect(view.gate.isEditing()).toBe(false);
  view.unmount();
});
it("Cancel releases its lease and discards late results without advancing the provider queue", async () => {
  let finish!: (value: Awaited<ReturnType<typeof translateText>>) => void;
  jest.mocked(translateText).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = setup();
  fireEvent.press(view.getByText("Translate 2 captions"));
  await waitFor(() => expect(translateText).toHaveBeenCalledTimes(1));
  fireEvent.press(view.getByText("common.cancel"));
  expect(view.gate.isEditing()).toBe(false);
  await act(async () => { finish({ translatedText: "Late text", sourceLang: "en", sameLanguage: false }); await Promise.resolve(); });
  expect(view.onApply).not.toHaveBeenCalled();
  expect(translateText).toHaveBeenCalledTimes(1);
  view.unmount();
});
