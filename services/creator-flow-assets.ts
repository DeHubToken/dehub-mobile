import { supabase } from './supabase';
import { dehubAuthHeaders } from './ai.service';
import type { GraphNode } from '../libs/creatorFlowGraph';
export interface FlowAsset { id: string; kind: string; url?: string; transcript?: string }
export const flowAssetId = (node: GraphNode): string => String(node.data.audioAssetId || node.data.inputAssetId || node.data.outputAssetId || '');

export async function loadFlowAssets(wallet: string, ids: string[]): Promise<Map<string, FlowAsset>> {
  const needed = new Set(ids.filter(Boolean)), found = new Map<string, FlowAsset>();
  if (!needed.size) return found;
  let offset: number | null = 0;
  while (offset !== null && found.size < needed.size) {
    const headers = await dehubAuthHeaders(wallet);
    if (!headers['x-dehub-token']) throw new Error('SIGN_IN_REQUIRED');
    const { data, error } = await supabase.functions.invoke('creator-library', { headers,
      body: { action: 'list', offset, includeHidden: true } });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not read saved media');
    for (const asset of (data?.jobs || []) as FlowAsset[]) if (needed.has(asset.id)) found.set(asset.id, asset);
    const next = data?.nextOffset;
    offset = Number.isInteger(next) && next > offset && next <= 10000 ? next : null;
  }
  return found;
}
export function assetNodePatch(node: GraphNode, asset: FlowAsset): Record<string, unknown> {
  const clear = { imageUrl: undefined, videoUrl: undefined, audioUrl: undefined, outputText: undefined, capturedFrameUrl: undefined };
  if (node.type === 'audioGenNode' && node.data.audioTask === 'transcribe' && asset.kind === 'audio' && asset.transcript?.trim()) return { ...clear, outputText: asset.transcript };
  if ((node.type === 'audioInputNode' || node.type === 'audioGenNode' && node.data.audioTask !== 'transcribe') && asset.kind === 'audio' && asset.url) return { ...clear, audioUrl: asset.url };
  if ((node.type === 'imageInputNode' || node.type === 'imageGenNode') && asset.kind === 'image' && asset.url) return { ...clear, imageUrl: asset.url };
  if ((node.type === 'videoInputNode' || node.type === 'videoGenNode') && asset.kind === 'video' && asset.url) return { ...clear, videoUrl: asset.url };
  throw new Error('creatorFlow.missingSavedMedia');
}
