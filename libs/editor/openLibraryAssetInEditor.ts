import type { CreatorAsset } from "../../services/creator.service";
import { importGeneratedMedia } from "./importGeneratedMedia";
import { generatedProject } from "./generatedProject";
import { saveProject } from "./storage";

/** Open the complete saved source as a new private editor project. */
export async function openLibraryAssetInEditor(asset: CreatorAsset, options: {
  signal: AbortSignal; isCurrent: () => boolean; onOpen: (projectId: string) => void;
}): Promise<boolean> {
  const current = () => !options.signal.aborted && options.isCurrent();
  if (!current()) return false;
  if (!asset.url || asset.kind === "model3d") throw new Error("This saved asset cannot be edited on a video timeline");
  const media = await importGeneratedMedia({ url: asset.url, kind: asset.kind, name: asset.prompt || asset.modelName }, options.signal);
  if (!current()) return false;
  const project = generatedProject(media);
  await saveProject(project);
  if (!current()) return false;
  options.onOpen(project.id);
  return true;
}
