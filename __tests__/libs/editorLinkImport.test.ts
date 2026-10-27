import { describe, expect, it } from "@jest/globals";
import { linkImportProgress } from "../../libs/editor/linkImport";

describe("link import progress", () => {
  it("is done only when the editor file is there", () => {
    expect(linkImportProgress({ state: "completed", result: { editorFile: { fileName: "a.mp4" } } })).toEqual({ kind: "done" });
    expect(linkImportProgress({ state: "completed", result: { createdTokenId: "1" } })).toEqual({ kind: "failed" });
  });
  it("tells a rate-limit wait apart from a failure", () => {
    expect(linkImportProgress({ state: "delayed", willRetry: true })).toEqual({ kind: "waiting" });
    expect(linkImportProgress({ state: "failed", willRetry: false })).toEqual({ kind: "failed" });
  });
  it("reports a clamped percentage while downloading", () => {
    expect(linkImportProgress({ state: "active", percent: 42.4 })).toEqual({ kind: "downloading", percent: 42 });
    expect(linkImportProgress({ state: "waiting" })).toEqual({ kind: "downloading", percent: 0 });
  });
});
