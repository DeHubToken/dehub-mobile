import { generationDraft, type GenerationDraft } from "./generationDraft";
import type { ProjectSnapshot } from "./types";

export function generationDraftOpener(deps: {
  current: () => ProjectSnapshot | null;
  save: (project: ProjectSnapshot) => Promise<void>;
  open: (draft: GenerationDraft) => void;
}) {
  let opening = false;
  return async (value: GenerationDraft): Promise<boolean> => {
    const draft = generationDraft(value);
    const project = deps.current();
    if (opening || !draft || !project) return false;
    opening = true;
    try {
      await deps.save(project);
      if (deps.current() !== project) return false;
      deps.open(draft);
      return true;
    } finally { opening = false; }
  };
}
