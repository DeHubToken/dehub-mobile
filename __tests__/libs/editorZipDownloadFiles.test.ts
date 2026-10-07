import { zipDownloadFiles } from "../../libs/editor/zipDownloadFiles";
import * as FileSystem from "expo-file-system/legacy";

const mockWrite = jest.fn(), mockClose = jest.fn(), mockDelete = jest.fn(), mockCreate = jest.fn();
jest.mock("expo-file-system", () => ({ Paths: { cache: "file://cache" }, File: jest.fn().mockImplementation(() => ({
  uri: "file://cache/clips.zip", create: (...args: unknown[]) => mockCreate(...args), delete: () => mockDelete(),
  open: () => ({ writeBytes: (bytes: Uint8Array) => mockWrite(bytes.slice()), close: () => mockClose() }),
})) }));
jest.mock("expo-file-system/legacy", () => ({ EncodingType: { Base64: "base64" }, getInfoAsync: jest.fn(), readAsStringAsync: jest.fn() }));
jest.mock("../../libs/editor/storage", () => ({ base64ToBytes: (text: string) => new Uint8Array(Buffer.from(text, "base64")) }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, size: 1_600_000, uri: "file://clip", modificationTime: 1 });
  jest.mocked(FileSystem.readAsStringAsync).mockImplementation(async (_, opts) => Buffer.alloc(opts!.length!, 7).toString("base64"));
});
it("writes an archive directly to cache while reading video files in bounded pieces", async () => {
  expect(await zipDownloadFiles([{ name: "clip-001.mp4", uri: "file://clip" }], "test")).toBe("file://cache/clips.zip");
  expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(3);
  expect(FileSystem.readAsStringAsync).toHaveBeenNthCalledWith(3, "file://clip", { encoding: "base64", position: 1572864, length: 27136 });
  expect(mockWrite.mock.calls.every(([bytes]) => bytes.length <= 786432)).toBe(true);
  expect(mockClose).toHaveBeenCalledTimes(1); expect(mockDelete).not.toHaveBeenCalled();
  const last = mockWrite.mock.calls.at(-1)![0] as Uint8Array;
  expect(new DataView(last.buffer).getUint32(0, true)).toBe(0x06054b50);
});
it("closes and removes a cancelled or truncated archive", async () => {
  const ctl = new AbortController();
  jest.mocked(FileSystem.readAsStringAsync).mockImplementationOnce(async (_, opts) => { ctl.abort(); return Buffer.alloc(opts!.length!, 7).toString("base64"); });
  await expect(zipDownloadFiles([{ name: "clip.mp4", uri: "file://clip" }], "test", ctl.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(mockClose).toHaveBeenCalledTimes(1); expect(mockDelete).toHaveBeenCalledTimes(1);
  jest.clearAllMocks();
  jest.mocked(FileSystem.readAsStringAsync).mockResolvedValueOnce("AA==");
  await expect(zipDownloadFiles([{ name: "clip.mp4", uri: "file://clip" }], "test")).rejects.toThrow("Incomplete");
  expect(mockDelete).toHaveBeenCalledTimes(1);
});
