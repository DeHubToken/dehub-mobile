import { exportPageArchive } from "../../libs/editor/exportPageArchive";
import { writeExport } from "../../libs/editor/storage";
import { zipDownloadFiles } from "../../libs/editor/zipDownloadFiles";
import { saveEditorDownload } from "../../libs/editor/saveEditorDownload";
import * as FileSystem from "expo-file-system/legacy";
import type { ProjectSnapshot } from "../../libs/editor/types";

jest.mock("../../libs/editor/storage", () => ({ writeExport: jest.fn() }));
jest.mock("../../libs/editor/zipDownloadFiles", () => ({ zipDownloadFiles: jest.fn() }));
jest.mock("../../libs/editor/saveEditorDownload", () => ({ saveEditorDownload: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({ deleteAsync: jest.fn().mockResolvedValue(undefined) }));
const snapshot = { title: "Café Tokyo", settings: { pages: [0, 5, 12] }, clips: [] } as unknown as ProjectSnapshot;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(writeExport).mockImplementation(async (_, format, title) => `file://${title}.${format}`);
  jest.mocked(zipDownloadFiles).mockResolvedValue("file://pages.zip");
  jest.mocked(saveEditorDownload).mockResolvedValue(undefined);
});
it.each(["png", "jpeg"] as const)("captures ordered %s pages, saves a titled ZIP and cleans every temporary file", async format => {
  const capture = jest.fn().mockResolvedValue(`data:image/${format};base64,YQ==`);
  const before = JSON.stringify(snapshot), progress = jest.fn();
  await exportPageArchive(snapshot, 7, format, capture, undefined, progress);
  expect(capture.mock.calls).toEqual([[format, 0.92, 0], [format, 0.92, 5], [format, 0.92, 12]]);
  const ext = format === "jpeg" ? "jpg" : "png";
  expect(zipDownloadFiles).toHaveBeenCalledWith([
    { name: `Café_Tokyo-01.${ext}`, uri: `file://Café_Tokyo-01.${format}` },
    { name: `Café_Tokyo-02.${ext}`, uri: `file://Café_Tokyo-02.${format}` },
    { name: `Café_Tokyo-03.${ext}`, uri: `file://Café_Tokyo-03.${format}` },
  ], snapshot.title, undefined, "pages");
  expect(saveEditorDownload).toHaveBeenCalledWith("file://pages.zip", "Café_Tokyo", "zip", "application/zip", undefined);
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(4);
  expect(progress).toHaveBeenLastCalledWith(1, 3, 3);
  expect(JSON.stringify(snapshot)).toBe(before);
});
it("stops a cancelled capture before the next page and removes earlier pages", async () => {
  const ctl = new AbortController();
  const capture = jest.fn().mockResolvedValueOnce("data:image/png;base64,YQ==").mockImplementationOnce(async () => { ctl.abort(); return "data:image/png;base64,YQ=="; });
  await expect(exportPageArchive(snapshot, 0, "png", capture, ctl.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(capture).toHaveBeenCalledTimes(2); expect(writeExport).toHaveBeenCalledTimes(1);
  expect(zipDownloadFiles).not.toHaveBeenCalled(); expect(saveEditorDownload).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith("file://Café_Tokyo-01.png", { idempotent: true });
});
it("removes all page files after an archive error and the archive after a save error", async () => {
  const capture = jest.fn().mockResolvedValue("data:image/png;base64,YQ==");
  jest.mocked(zipDownloadFiles).mockRejectedValueOnce(new Error("archive full"));
  await expect(exportPageArchive(snapshot, 0, "png", capture)).rejects.toThrow("archive full");
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(3); expect(saveEditorDownload).not.toHaveBeenCalled();
  jest.clearAllMocks();
  jest.mocked(saveEditorDownload).mockRejectedValueOnce(new Error("save failed"));
  await expect(exportPageArchive(snapshot, 0, "png", capture)).rejects.toThrow("save failed");
  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(4);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith("file://pages.zip", { idempotent: true });
});
