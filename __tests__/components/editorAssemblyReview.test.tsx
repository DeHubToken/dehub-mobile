import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import AssemblyReview from "../../components/editor/AssemblyReview";
import { useAssembly } from "../../libs/editor/useAssembly";
import type { AssemblySession } from "../../libs/editor/assembly";
import type { ProjectSnapshot } from "../../libs/editor/types";

jest.mock("react-native-css-interop/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));
jest.mock("react-native", () => ({ View: "View", Text: "Text", TextInput: "TextInput", Pressable: "Pressable", StyleSheet: { flatten: (style: unknown) => style } }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const original: ProjectSnapshot = { id: "original", title: "Source", updatedAt: 1, settings: { width: 640, height: 360, fps: 30, aspectPreset: "16:9", background: "#000" },
  clips: [{ id: "one", kind: "video", mediaId: "v", trackId: "track", start: 5, duration: 5, trimIn: 2 }, { id: "two", kind: "image", mediaId: "p", trackId: "track", start: 10, duration: 5, trimIn: 0 }],
  tracks: [{ id: "track", kind: "video", name: "Video", hidden: false, muted: false }] };
let session: AssemblySession;
const create = jest.fn(async () => true);
function Harness({ changed = false }: { changed?: boolean }) {
  const [state, controller] = useAssembly({ current: () => original, create }); session = controller;
  React.useEffect(() => { controller.start({ seconds: 8, selected: false, transition: null, music: false }, []); }, [controller]);
  return <AssemblyReview state={state} session={controller} changed={changed} names={{ v: "Source video", p: "Photo" }} onPreview={jest.fn()} onCreate={() => { void controller.create(); }} onClose={() => controller.reset()} />;
}
beforeEach(() => create.mockClear());
it("reorders and trims draft shots through the actual controls without changing the original", () => {
  const before = JSON.stringify(original), screen = render(<Harness />);
  fireEvent.press(screen.getByLabelText("editor.menu.bringForward 2"));
  expect(session.state.shots.map(s => s.id)).toEqual(["two", "one"]);
  fireEvent.changeText(screen.getByLabelText("filters.duration 1"), "1."); expect(screen.getByLabelText("filters.duration 1").props.value).toBe("1.");
  fireEvent.changeText(screen.getByLabelText("filters.duration 1"), "1,25");
  fireEvent.changeText(screen.getByLabelText("editor.shots.preview 1"), "1.5");
  expect(session.state.shots[0]).toEqual({ id: "two", offset: 1.5, duration: 1.25 });
  fireEvent.press(screen.getByLabelText("editor.video.tFade")); expect(session.state.transition).toBe("fade");
  expect(JSON.stringify(original)).toBe(before); expect(create).not.toHaveBeenCalled();
});
it("blocks malformed range/source-change creation and retains the typed draft for correction", async () => {
  const screen = render(<Harness />);
  fireEvent.changeText(screen.getByLabelText("editor.shots.preview 1"), "");
  expect(screen.getByLabelText("editor.shots.preview —").props.disabled).toBe(true);
  expect(screen.getByLabelText("nav.create").props.disabled).toBe(true);
  expect(screen.queryByText(/NaN/)).toBeNull();
  fireEvent.changeText(screen.getByLabelText("editor.shots.preview 1"), "4");
  expect(session.state.error).toBe("limit"); expect(screen.getByLabelText("nav.create").props.disabled).toBe(true);
  fireEvent.press(screen.getByLabelText("nav.create")); expect(create).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText("filters.duration 1"), "0.5"); expect(session.state.error).toBeNull();
  screen.rerender(<Harness changed />); fireEvent.press(screen.getByLabelText("nav.create")); expect(create).not.toHaveBeenCalled();
  await act(async () => { session.reset(); });
});

it("reviews imported files on an empty source through actual selection, preview and soundtrack controls", async () => {
  const source = { ...original, clips: [], tracks: [] }, before = JSON.stringify(source), preview = jest.fn();
  const assets = [{ id: "photo", name: "Imported photo", kind: "image" as const },
    { id: "video", name: "Imported footage", kind: "video" as const, duration: 6 },
    { id: "song", name: "Imported song", kind: "audio" as const, duration: 3 }];
  function LibraryHarness() {
    const [state, controller] = useAssembly({ current: () => source, library: () => assets, create }); session = controller;
    React.useEffect(() => { controller.start({ seconds: 10, selected: false, transition: "fade", music: true }, [], assets); }, [controller]);
    return <AssemblyReview state={state} session={controller} changed={false} names={{ photo: "Imported photo", video: "Imported footage", song: "Imported song" }}
      onPreview={index => preview(controller.preview(index))} onCreate={() => { void controller.create(); }} onClose={() => controller.reset()} />;
  }
  const screen = render(<LibraryHarness />);
  expect(screen.getByLabelText("Imported photo").props.accessibilityState.checked).toBe(false);
  fireEvent.press(screen.getByLabelText("Imported photo")); fireEvent.press(screen.getByLabelText("Imported footage"));
  expect(session.state.shots.map(s => s.duration)).toEqual([5, 5]);
  fireEvent.press(screen.getAllByLabelText(/^editor.shots.preview /).find(node => node.props.accessibilityRole === "button")!);
  expect(preview).toHaveBeenCalledWith(expect.objectContaining({ libraryClip: expect.objectContaining({ mediaId: "photo", start: 0, duration: 5 }) }));
  fireEvent.press(screen.getByLabelText("Imported song")); expect(session.state.soundId).toBe("@assembly-library:song");
  expect(JSON.stringify(source)).toBe(before);
  await act(async () => fireEvent.press(screen.getByLabelText("nav.create")));
  expect(create).toHaveBeenCalledWith(source, expect.objectContaining({ soundId: "@assembly-library:song" }), expect.any(AbortSignal), expect.any(Array));
});
