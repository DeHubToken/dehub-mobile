import { generationDraftOpener } from "../../libs/editor/openGenerationDraft";
import { newProject } from "../../libs/editor/project";
import type { GenerationDraft } from "../../libs/editor/generationDraft";

const draft: GenerationDraft = { kind: "voice", prompt: "Keep the last sentence." };

describe("opening editor generation drafts", () => {
  it("saves the exact source before opening and ignores duplicate taps", async () => {
    const project = newProject("16:9", "Original");
    let saved!: () => void;
    const save = jest.fn(() => new Promise<void>(resolve => { saved = resolve; }));
    const open = jest.fn();
    const launch = generationDraftOpener({ current: () => project, save, open });
    const pending = launch(draft);
    expect(save).toHaveBeenCalledWith(project);
    expect(open).not.toHaveBeenCalled();
    expect(await launch({ kind: "image", prompt: "Other draft" })).toBe(false);
    saved();
    expect(await pending).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(draft);
  });

  it("keeps the editor open on save failure and allows a retry", async () => {
    const project = newProject("16:9", "Original");
    const save = jest.fn().mockRejectedValueOnce(new Error("storage full")).mockResolvedValueOnce(undefined);
    const open = jest.fn();
    const launch = generationDraftOpener({ current: () => project, save, open });
    await expect(launch(draft)).rejects.toThrow("storage full");
    expect(open).not.toHaveBeenCalled();
    expect(await launch(draft)).toBe(true);
  });

  it.each(["changed", "closed"])("does not open after the editor is %s while saving", async reason => {
    const original = newProject("16:9", "Original");
    let current: typeof original | null = original;
    let saved!: () => void;
    const open = jest.fn();
    const launch = generationDraftOpener({ current: () => current, save: () => new Promise<void>(resolve => { saved = resolve; }), open });
    const pending = launch(draft);
    current = reason === "closed" ? null : { ...original, title: "Changed" };
    saved();
    expect(await pending).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
