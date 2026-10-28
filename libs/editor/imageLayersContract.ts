export interface ImageLayer { id: string; index: number; url: string; width: number; height: number }
export interface ImageLayerSet { version: 1; id: string; sourceAssetId: string; width: number; height: number; layers: ImageLayer[] }
export interface LayerChoice { id: string; hidden: boolean }
export function validateLayerSet(value: any): ImageLayerSet {
  if (value?.version !== 1 || !/^[0-9a-f-]{36}$/i.test(value.id) || typeof value.sourceAssetId !== 'string' ||
    !Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 1 || value.height < 1 ||
    value.width > 4096 || value.height > 4096 || value.width * value.height > 4194304 || value.layers?.length !== 4) throw new Error('Invalid saved layer set');
  value.layers.forEach((layer: ImageLayer, index: number) => {
    if (layer.id !== `${value.id}-layer-${index}` || layer.index !== index || layer.width !== value.width || layer.height !== value.height) throw new Error('Invalid saved layer canvas');
    const url = new URL(layer.url);
    if (url.protocol !== 'https:' || url.username || url.password || !url.pathname.includes('/storage/v1/object/sign/creator-assets/')) throw new Error('Invalid saved layer URL');
  });
  return value;
}
export function selectedLayers(set: ImageLayerSet, choices: LayerChoice[]) {
  validateLayerSet(set);
  if (choices.length !== 4 || new Set(choices.map(c => c.id)).size !== 4) throw new Error('Choose all four layers');
  return choices.map(choice => {
    const layer = set.layers.find(layer => layer.id === choice.id);
    if (!layer || typeof choice.hidden !== 'boolean') throw new Error('Invalid layer selection');
    return { ...layer, hidden: choice.hidden };
  });
}
export function layerExportManifest(set: ImageLayerSet, choices: LayerChoice[]) {
  return { version: 1, operation: 'decompose', id: set.id, sourceAssetId: set.sourceAssetId, width: set.width, height: set.height,
    layers: selectedLayers(set, choices).map(layer => ({ id: layer.id, index: layer.index, file: `layer-${layer.index + 1}.png`, hidden: layer.hidden })) };
}
