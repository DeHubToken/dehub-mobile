import { act, renderHook } from "@testing-library/react-native";
import { useProjectHistory } from "./useProjectHistory";
import { applyCaptionText, captionReplacement } from "./captionText";
import { subtitleLayers } from "./subtitles";
import { DEFAULT_SETTINGS } from "./types";

it("undoes and redoes a bulk caption correction in one real native history step", () => {
  let id = 0;
  const layers = subtitleLayers([{ start: 0, end: 1, text: "Hello" }, { start: 1, end: 2, text: "Hello again" }], () => `c${++id}`);
  const snapshot = { id: "caption-text-history", title: "Captions", updatedAt: 1, settings: DEFAULT_SETTINGS, tracks: [layers.track], clips: layers.clips };
  const { result, unmount } = renderHook(() => useProjectHistory(snapshot));
  const next = applyCaptionText(snapshot, captionReplacement(snapshot, "Hello", "Hi"));
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
