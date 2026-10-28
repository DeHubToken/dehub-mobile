import * as FileSystem from 'expo-file-system/legacy';
import { importGeneratedMedia } from './importGeneratedMedia';
import { layerExportManifest, selectedLayers, validateLayerSet, type ImageLayerSet, type LayerChoice } from './imageLayersContract';
import { addImage, newId } from './project';
import type { ProjectSnapshot } from './types';
import { mediaFileUri, type MediaMeta } from './storage';
import { zipDownloadFiles } from './zipDownloadFiles';
import { saveEditorDownload } from './saveEditorDownload';
import { throwIfImportAborted } from './generatedMediaProbe';

export async function importImageLayers(set: ImageLayerSet, choices: LayerChoice[], signal: AbortSignal) {
  const media: MediaMeta[] = [];
  for (const layer of selectedLayers(set, choices)) {
    const item = await importGeneratedMedia({ kind: 'image', url: layer.url, name: `Layer ${layer.index + 1}`,
      expectedDimensions: { width: set.width, height: set.height } }, signal);
    if (media.length && (item.width !== media[0].width || item.height !== media[0].height)) throw new Error('Layer canvas changed');
    media.push(item);
  }
  throwIfImportAborted(signal);
  return media;
}
/** Assemble in memory, then commit this complete snapshot as one history entry. */
export function insertImageLayers(project: ProjectSnapshot, media: MediaMeta[], set: ImageLayerSet, choices: LayerChoice[]) {
  const layers = selectedLayers(set, choices);
  if (media.length !== 4 || media.some(item => item.kind !== 'image' || item.width !== media[0].width || item.height !== media[0].height)) throw new Error('Incomplete layer import');
  let next = project;
  const groupId = newId(10);
  for (const [index, layer] of layers.entries()) {
    const added = addImage(next, media[index].id);
    next = { ...added.project, clips: added.project.clips.map(clip => clip.id === added.clipId ? { ...clip, groupId, label: `Layer ${layer.index + 1}`, hidden: layer.hidden } : clip) };
  }
  return next;
}
export async function exportImageLayers(set: ImageLayerSet, choices: LayerChoice[], signal: AbortSignal) {
  validateLayerSet(set);
  const media = await importImageLayers(set, choices, signal);
  const root = FileSystem.cacheDirectory;
  if (!root) throw new Error('Export storage unavailable');
  const manifest = `${root}layer-manifest-${set.id}.json`;
  let archive: string | undefined;
  try {
    await FileSystem.writeAsStringAsync(manifest, JSON.stringify(layerExportManifest(set, choices), null, 2));
    const files = media.map((item, index) => ({ name: `layer-${set.layers.find(layer => layer.id === choices[index].id)!.index + 1}.png`, uri: mediaFileUri(item) }));
    files.push({ name: 'manifest.json', uri: manifest });
    archive = await zipDownloadFiles(files, `layers-${set.id}`, signal);
    await saveEditorDownload(archive, `layers-${set.id}`, 'zip', 'application/zip', signal);
  } finally {
    await FileSystem.deleteAsync(manifest, { idempotent: true }).catch(() => {});
    if (archive) await FileSystem.deleteAsync(archive, { idempotent: true }).catch(() => {});
  }
}
