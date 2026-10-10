import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react-native";
import StockPanel from "../../components/editor/StockPanel";
import { importStockLibraryItem, searchStockPage } from "../../libs/editor/stock";
import type { FreeAsset } from "../../libs/editor/freeAssets";

jest.mock("react-native-css-interop/jsx-runtime", () => jest.requireActual("react/jsx-runtime"));
jest.mock("react-native", () => ({ View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView", TextInput: "TextInput", StyleSheet: { flatten: (style: unknown) => style }, Linking: { openURL: jest.fn() } }));
jest.mock("expo-image", () => ({ Image: "Image" }));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("../../hooks/useSurfaceDraft", () => ({ useSurfaceDraft: (_key: string, initial: string) => jest.requireActual("react").useState(initial) }));
jest.mock("../../libs/editor/stock", () => ({ importStockLibraryItem: jest.fn(), searchStockPage: jest.fn() }));
jest.mock("../../components/DeHubLoader", () => () => null);
jest.mock("../../components/editor/StockMediaPreview", () => () => null);

const source: FreeAsset = { id: "one", source: "Wikimedia Commons", kind: "video", title: "Ocean", creator: "Creator", thumbnailUrl: "https://media/thumb.jpg", downloadUrl: "https://media/ocean.webm", landingUrl: "https://media/source", mimeType: "video/webm", license: "CC0", attributionRequired: false, attributionText: "Ocean" };
const added = jest.fn(), release = jest.fn();
const subscribe = () => () => {};
const props = { at: 3, scope: 1, subscribe, onAdd: added, onStart: () => ({ isCurrent: () => true, release }) };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { jest.clearAllMocks(); jest.mocked(searchStockPage).mockResolvedValue({ items: [source], page: 1, hasMore: false, providers: [] }); });
afterEach(() => cleanup());
async function search(view: ReturnType<typeof render>) { await act(async () => { fireEvent.press(view.getByText("common.search")); }); }

it("offers all six stock categories", () => {
  const view = render(<StockPanel {...props} />);
  for (const label of ["editor.app.photo", "editor.video.video", "editor.motion.title", "editor.rail.elements", "creatorPacks.tab.gif", "editor.video.sound"]) expect(view.getByText(label)).toBeTruthy();
});
it("loads the default video library even before a query is entered", async () => {
  const view = render(<StockPanel {...props} />); await search(view);
  expect(searchStockPage).toHaveBeenCalledWith("", "all", "video", 1, expect.anything()); expect(view.getByText("Ocean")).toBeTruthy();
});
it("loads another provider page without displaying duplicate files", async () => {
  jest.mocked(searchStockPage).mockResolvedValueOnce({ items: [source], page: 1, hasMore: true, providers: [] }).mockResolvedValueOnce({ items: [{ ...source, id: "duplicate" }, { ...source, id: "two", title: "City", downloadUrl: "https://media/city.webm" }], page: 2, hasMore: false, providers: [] });
  const view = render(<StockPanel {...props} />); await search(view);
  await act(async () => { fireEvent.press(view.getByText("notifications.loadMore")); });
  expect(searchStockPage).toHaveBeenLastCalledWith("", "all", "video", 2, expect.anything());
  expect(view.getAllByText("Ocean")).toHaveLength(1); expect(view.getByText("City")).toBeTruthy();
});
it("aborts and ignores an old video search after switching to graphics", async () => {
  const pending = deferred<Awaited<ReturnType<typeof searchStockPage>>>(); jest.mocked(searchStockPage).mockReturnValueOnce(pending.promise);
  const view = render(<StockPanel {...props} />); await search(view);
  fireEvent.press(view.getByText("editor.rail.elements"));
  expect(jest.mocked(searchStockPage).mock.calls[0][4]!.aborted).toBe(true);
  await act(async () => { pending.resolve({ items: [source], page: 1, hasMore: false, providers: [] }); });
  expect(view.queryByText("Ocean")).toBeNull(); await search(view);
  expect(searchStockPage).toHaveBeenLastCalledWith("", "all", "graphic", 1, expect.anything());
});
it("passes the chosen phone orientation through to the provider", async () => {
  const view = render(<StockPanel {...props} />); fireEvent.press(view.getByText("editor.app.aspectStory")); await search(view);
  expect(searchStockPage).toHaveBeenCalledWith("", "portrait", "video", 1, expect.anything());
});
it("keeps earlier results and their next page after a load-more failure", async () => {
  jest.mocked(searchStockPage).mockResolvedValueOnce({ items: [source], page: 1, hasMore: true, providers: [] }).mockRejectedValueOnce(new Error("offline"));
  const view = render(<StockPanel {...props} />); await search(view); await act(async () => { fireEvent.press(view.getByText("notifications.loadMore")); });
  expect(view.getByText("Ocean")).toBeTruthy(); expect(view.getByText("common.failedToLoad")).toBeTruthy(); expect(view.getByText("notifications.loadMore")).toBeTruthy();
});
it("owns an import until completion and adds it at the original playhead", async () => {
  const pending = deferred<Awaited<ReturnType<typeof importStockLibraryItem>>>(); jest.mocked(importStockLibraryItem).mockReturnValue(pending.promise);
  const view = render(<StockPanel {...props} />); await search(view); await act(async () => { fireEvent.press(view.getByText("common.select")); });
  view.rerender(<StockPanel {...props} at={8} />);
  await act(async () => { pending.resolve({ id: "take", kind: "video" } as never); });
  expect(added).toHaveBeenCalledWith(expect.objectContaining({ id: "take" }), 3); expect(release).toHaveBeenCalledTimes(1);
});
it("discards a late import when the editor scope changes", async () => {
  const pending = deferred<Awaited<ReturnType<typeof importStockLibraryItem>>>(); jest.mocked(importStockLibraryItem).mockReturnValue(pending.promise);
  const view = render(<StockPanel {...props} />); await search(view); await act(async () => { fireEvent.press(view.getByText("common.select")); });
  view.rerender(<StockPanel {...props} scope={2} />); await act(async () => { pending.resolve({ id: "foreign", kind: "video" } as never); });
  expect(added).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledTimes(1);
});
