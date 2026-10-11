import { act, renderHook } from "@testing-library/react-native";
import { useProjectHistory } from "./useProjectHistory";
import { applyCaptionTranslation, planCaptionTranslation } from "./captionTranslation";
import { subtitleLayers } from "./subtitles";
import { DEFAULT_SETTINGS } from "./types";

it("replaces native caption wording in one real Undo and Redo step", () => {
  let id = 0;
  const layers = subtitleLayers([{ start: 0, end: 1, text: "Hello" }, { start: 1, end: 2, text: "World" }], () => `c${++id}`);
  const snapshot = { id: "caption-history", title: "Captions", updatedAt: 1, settings: DEFAULT_SETTINGS, tracks: [layers.track], clips: layers.clips };
  const { result, unmount } = renderHook(() => useProjectHistory(snapshot));
  const plan = planCaptionTranslation(snapshot);
  const next = applyCaptionTranslation(snapshot, plan, plan.cues.map(cue => ({ id: cue.id, text: `French ${cue.text}` })));
  act(() => { result.current.commit(next); });
  expect(result.current.latest()?.clips).toEqual(next.clips);
  expect(result.current.canUndo).toBe(true);
  act(() => { result.current.undo(); });
  expect(result.current.latest()?.clips).toEqual(snapshot.clips);
  expect(result.current.canUndo).toBe(false);
  act(() => { result.current.redo(); });
  expect(result.current.latest()?.clips).toEqual(next.clips);
  expect(result.current.latest()?.settings).toEqual(DEFAULT_SETTINGS);
  unmount();
});
