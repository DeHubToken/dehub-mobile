import * as FileSystem from "expo-file-system/legacy";
import { newId } from "./project";
import { getMedia, mediaFileUri, saveProject } from "./storage";
import { assemblyProject, persistAssembly, type AssemblyPlan } from "./assembly";
import { assemblyCatalogMatches, selectedAssemblyAssets, type AssemblyAsset } from "./assemblyLibrary";
import type { ProjectSnapshot } from "./types";

export async function createAssemblyEdit(original: ProjectSnapshot, plan: AssemblyPlan, title: string, runtime: {
  current: () => ProjectSnapshot | null;
  commit: (source: ProjectSnapshot, copy: ProjectSnapshot) => void;
}, signal: AbortSignal, library: readonly AssemblyAsset[] = []): Promise<boolean> {
  const current: AssemblyAsset[] = [];
  for (const asset of selectedAssemblyAssets(original, plan, library)) {
    if (signal.aborted) return false;
    const meta = await getMedia(asset.id);
    if (!meta) return false;
    const info = await FileSystem.getInfoAsync(mediaFileUri(meta));
    if (!info.exists || info.isDirectory || ("size" in info && info.size <= 0)) return false;
    current.push(meta);
  }
  if (signal.aborted || !assemblyCatalogMatches(original, plan, library, current)) return false;
  const next = assemblyProject(original, plan, { id: newId(10), title }, () => newId(10), library);
  return persistAssembly(original, next, { ...runtime, save: saveProject }, signal);
}
