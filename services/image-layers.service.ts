import { libraryCall } from './creator.service';
import { pollAiTool, startAiTool } from './ai.service';
import { validateLayerSet, type ImageLayerSet } from '../libs/editor/imageLayersContract';
export interface LayerJob { id: string; status: string; sourceDigest?: string; requestId?: string; appId?: string }
export async function layerJobs(wallet: string, sourceAssetId: string): Promise<LayerJob[]> {
  return (await libraryCall({ action: 'layer-jobs', sourceAssetId }, wallet)).jobs;
}
export async function collectLayers(wallet: string, job: LayerJob): Promise<ImageLayerSet | null> {
  if (job.requestId && job.appId && !['succeeded','failed','canceled','cancelled','refund_pending'].includes(job.status)) {
    const result = await pollAiTool({ requestId: job.requestId, appId: job.appId }, wallet);
    if (result.error) throw new Error(result.error);
  }
  const result = await libraryCall({ action: 'layer-set', id: job.id }, wallet);
  return result.layerSet ? validateLayerSet(result.layerSet) : null;
}
export async function submitLayers(wallet: string, sourceAssetId: string, clientJobId: string, txHash: string, acceptedPriceDhb: number, sourceDigest?: string) {
  const result = await startAiTool({ tool: 'qwen-image-layered', sourceAssetId, sourceDigest, clientJobId, txHash, acceptedPriceDhb }, wallet);
  if (result.error) throw new Error(result.error);
  return result;
}
