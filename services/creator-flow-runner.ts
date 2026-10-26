import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { DIGITAL_PURCHASES_ENABLED } from '../config/storefront';
import { graphOrder, GENERATORS, connectedText, durableFlowNodes } from '../libs/creatorFlowGraph';
import { CREATOR_DEFAULTS, creatorInputIssue, creatorPromptLimit, normalizeCreatorSettings, type CreatorStudioSettings } from '../libs/creatorStudio';
import { generateImage, startVideoGeneration, pollVideoGeneration, quoteAiJob, type AiQuoteRequest } from './ai.service';
import { saveCreatorAsset } from './creator.service';
import { loadFlowAssets, flowAssetId, assetNodePatch } from './creator-flow-assets';
import type { FlowNode, FlowEdge } from './creator-flows.service';

export interface NativeFlowGraph { id: string; nodes: FlowNode[]; edges: FlowEdge[] }
export interface NativeFlowPlan { graph: NativeFlowGraph; signature: string; order: string[]; priceDhb: number; priceUsd: number; resume: boolean }
interface NodeReceipt { jobId: string; state: 'submitting' | 'polling' | 'done' | 'error'; ticket?: { predictionId: string; provider?: string; falAppId?: string }; assetId?: string; error?: string }
export interface NativeFlowReceipt { signature: string; txHash: string; nodes: Record<string, NodeReceipt> }
type Quote = AiQuoteRequest & { resolution?: string; hasEndFrame?: boolean; hasAudioReferences?: boolean; hasVideoReferences?: boolean; hasInlineMedia?: boolean };

function receiptKey(wallet: string, id: string) { return `creator-flow-run-v1:${wallet.toLowerCase()}:${id}`; }
const fingerprint = (graph: NativeFlowGraph) => JSON.stringify({ nodes: durableFlowNodes(graph.nodes).map(node => ({ id: node.id, type: node.type,
  data: Object.fromEntries(Object.entries(node.data).filter(([key]) => !['status','errorMsg','hasError','jobId','pendingGenerate','pipelineQueued','generations','currentGenIdx','outputText','outputAssetId',
    ...(GENERATORS.has(node.type || '') ? ['imageUrl','videoUrl','audioUrl'] : [])].includes(key))) })), edges: graph.edges });

function upstream(node: FlowNode, graph: NativeFlowGraph, handle: string) {
  return graph.edges.filter(edge => edge.target === node.id && edge.targetHandle === handle).map(edge => ({ node: graph.nodes.find(source => source.id === edge.source)!, handle: edge.sourceHandle }));
}
function imageOf(source: { node: FlowNode; handle?: string | null }) {
  return String(source.handle === 'frame' ? source.node.data.capturedFrameUrl || '' : source.node.data.imageUrl || '');
}
function settingsFor(node: FlowNode, graph: NativeFlowGraph): CreatorStudioSettings {
  const mode = node.type === 'imageGenNode' ? 'image' : 'video';
  const references = [...(mode === 'video' ? upstream(node, graph, 'startFrame') : []), ...upstream(node, graph, 'image')];
  const videos = upstream(node, graph, 'referenceVideo');
  const endFrame = upstream(node, graph, 'endFrame')[0];
  return { ...CREATOR_DEFAULTS[mode], mode, model: String(node.data.model || CREATOR_DEFAULTS[mode].model),
    aspect: String(node.data.aspectRatio || CREATOR_DEFAULTS[mode].aspect), durationSeconds: Number(node.data.duration ?? CREATOR_DEFAULTS[mode].durationSeconds),
    resolution: String(node.data.resolution || CREATOR_DEFAULTS[mode].resolution),
    ...(node.data.seed !== undefined ? { seed: String(node.data.seed) } : {}),
    ...(node.data.negativePrompt ? { negativePrompt: String(node.data.negativePrompt) } : {}),
    referenceAssets: [...references.map(source => ({ uri: imageOf(source) || 'https://pending.invalid/image', label: source.node.data.label || source.node.id, kind: 'image' as const })),
      ...videos.map(source => ({ uri: String(source.node.data.videoUrl || 'https://pending.invalid/video'), label: source.node.data.label || source.node.id, kind: 'video' as const,
        ...(source.node.data.videoDuration ? { seconds: Number(source.node.data.videoDuration) } : {}) }))],
    ...(endFrame ? { endFrame: { uri: imageOf(endFrame) || 'https://pending.invalid/image', label: endFrame.node.id, kind: 'image' as const } } : {}) };
}
function validateNode(node: FlowNode, graph: NativeFlowGraph) {
  if (node.type !== 'imageGenNode' && node.type !== 'videoGenNode') throw new Error('creatorFlow.unsupportedNode');
  const prompt = upstream(node, graph, 'prompt')[0]?.node;
  if (!prompt || prompt.type === 'promptNode' && !String(prompt.data.prompt || '').trim()) throw new Error('creatorFlow.missingPrompt');
  const settings = settingsFor(node, graph), normalized = normalizeCreatorSettings(settings);
  const promptText = connectedText(node, graph.nodes, graph.edges), limit = creatorPromptLimit(settings);
  if (limit && promptText.length > limit) throw new Error('creatorFlow.invalidSettings');
  for (const handle of ['image','startFrame','endFrame','referenceVideo']) {
    for (const source of upstream(node, graph, handle)) {
      if (source.handle === 'frame' && !source.node.data.capturedFrameUrl) throw new Error('creatorFlow.missingCapturedFrame');
      if (source.node.type === 'imageInputNode' && !source.node.data.imageUrl || source.node.type === 'videoInputNode' && !source.node.data.videoUrl) throw new Error('creatorFlow.missingSavedMedia');
    }
  }
  if (normalized.model !== settings.model || normalized.aspect !== settings.aspect || normalized.durationSeconds !== settings.durationSeconds || normalized.resolution !== settings.resolution ||
    settings.seed && normalized.seed !== settings.seed || settings.negativePrompt && normalized.negativePrompt !== settings.negativePrompt || settings.endFrame && !normalized.endFrame) throw new Error('creatorFlow.invalidSettings');
  const issue = creatorInputIssue(settings, !!settings.referenceAssets?.some(asset => asset.kind === 'image'));
  if (issue) throw new Error(issue);
  return settings;
}

async function hydrate(graph: NativeFlowGraph, wallet: string): Promise<NativeFlowGraph> {
  const owned = await loadFlowAssets(wallet, graph.nodes.map(flowAssetId));
  return { ...graph, nodes: graph.nodes.map(node => {
    const id = flowAssetId(node);
    if (!id) return { ...node, data: { ...node.data } };
    const asset = owned.get(id);
    if (!asset) throw new Error('creatorFlow.missingSavedMedia');
    return { ...node, data: { ...node.data, ...assetNodePatch(node, asset) } };
  }) };
}

/** Pure graph validation and server pricing happen before any payment. */
export async function planNativeFlow(graph: NativeFlowGraph, wallet: string): Promise<NativeFlowPlan> {
  const order = graphOrder(graph.nodes, graph.edges).filter(id => GENERATORS.has(graph.nodes.find(node => node.id === id)?.type || ''));
  if (!order.length) throw new Error('creatorFlow.nothingToRun');
  const signature = fingerprint(graph), receipt = await readNativeFlowReceipt(wallet, graph.id);
  const resume = !!receipt && receipt.signature === signature;
  if (receipt && !resume && Object.values(receipt.nodes).some(node => node.state !== 'done')) throw new Error('creatorFlow.recoverBeforeEdit');
  if (resume && order.every(id => receipt!.nodes[id]?.state === 'done')) throw new Error('creatorFlow.runAlreadyComplete');
  const prepared = await hydrate(graph, wallet);
  let priceDhb = 0, priceUsd = 0;
  for (const id of order) {
    const node = prepared.nodes.find(node => node.id === id)!, settings = validateNode(node, prepared);
    if (resume && receipt!.nodes[id]?.state === 'done') continue;
    const quote: Quote = { kind: settings.mode === 'image' ? 'image' : 'video', modelId: settings.model,
      ...(settings.mode === 'video' ? { durationSeconds: settings.durationSeconds, resolution: settings.resolution,
        hasEndFrame: !!settings.endFrame, hasVideoReferences: upstream(node, prepared, 'referenceVideo').length > 0,
        hasAudioReferences: false, hasInlineMedia: !!settings.referenceAssets?.some(asset => asset.uri.startsWith('data:')) || !!settings.endFrame?.uri.startsWith('data:') } : {}) };
    const priced = await quoteAiJob(quote);
    if (!Number.isFinite(priced.priceDhb) || priced.priceDhb <= 0 || !Number.isFinite(priced.priceUsd) || priced.priceUsd < 0) throw new Error('creatorFlow.quoteFailed');
    priceDhb += priced.priceDhb; priceUsd += priced.priceUsd;
  }
  return { graph: prepared, signature, order, priceDhb, priceUsd, resume };
}

export async function readNativeFlowReceipt(wallet: string, flowId: string): Promise<NativeFlowReceipt | null> {
  const value = await AsyncStorage.getItem(receiptKey(wallet, flowId));
  if (!value) return null;
  try {
    const result = JSON.parse(value);
    if (!result?.nodes || typeof result.nodes !== 'object' || Array.isArray(result.nodes) || typeof result.signature !== 'string' || typeof result.txHash !== 'string' || !result.txHash) throw new Error('Invalid receipt');
    for (const node of Object.values(result.nodes) as NodeReceipt[]) {
      if (!node || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(node.jobId) || !['submitting','polling','done','error'].includes(node.state) ||
        node.ticket && (typeof node.ticket.predictionId !== 'string' || !node.ticket.predictionId || node.ticket.predictionId.length > 200)) throw new Error('Invalid receipt');
    }
    return result;
  } catch { throw new Error('creatorFlow.recoveryCorrupt'); }
}

/** A new paid run can replace local recovery only after every node was delivered. */
export async function restartNativeFlowRun(wallet: string, flowId: string): Promise<void> {
  const receipt = await readNativeFlowReceipt(wallet, flowId);
  if (receipt && Object.values(receipt.nodes).some(node => node.state !== 'done')) throw new Error('creatorFlow.recoverBeforeEdit');
  await AsyncStorage.removeItem(receiptKey(wallet, flowId));
}

/** Receipt/job IDs stay in account-scoped local storage, outside public graph JSON. */
export async function runNativeFlow(plan: NativeFlowPlan, wallet: string, txHash: string,
  isCurrent: () => boolean, onNode: (node: FlowNode) => void): Promise<void> {
  if (!DIGITAL_PURCHASES_ENABLED) throw new Error('creatorFlow.paidUnavailable');
  const assertCurrent = () => { if (!isCurrent()) throw new Error('SIGN_IN_REQUIRED'); };
  assertCurrent();
  if (fingerprint(plan.graph) !== plan.signature) throw new Error('creatorFlow.planChanged');
  let receipt = await readNativeFlowReceipt(wallet, plan.graph.id);
  if (receipt && receipt.signature !== plan.signature && Object.values(receipt.nodes).some(node => node.state !== 'done')) throw new Error('creatorFlow.recoverBeforeEdit');
  if (!receipt || receipt.signature !== plan.signature) receipt = { signature: plan.signature, txHash, nodes: {} };
  const persist = () => AsyncStorage.setItem(receiptKey(wallet, plan.graph.id), JSON.stringify(receipt));
  const graph = await hydrate(plan.graph, wallet);
  for (const id of plan.order) {
    assertCurrent();
    const node = graph.nodes.find(node => node.id === id)!;
    let saved = receipt.nodes[id];
    if (saved?.state === 'done' && saved.assetId) {
      const assets = await loadFlowAssets(wallet, [saved.assetId]); assertCurrent();
      const asset = assets.get(saved.assetId);
      if (!asset) throw new Error('creatorFlow.missingSavedMedia');
      node.data = { ...node.data, ...assetNodePatch(node, asset), outputAssetId: saved.assetId, status: 'done' };
      onNode(node); continue;
    }
    if (!saved) { saved = { jobId: Crypto.randomUUID(), state: 'submitting' }; receipt.nodes[id] = saved; await persist(); }
    const settings = validateNode(node, graph);
    const prompt = connectedText(node, graph.nodes, graph.edges).trim();
    if (!prompt) throw new Error('creatorFlow.missingPrompt');
    node.data = { ...node.data, status: 'running', errorMsg: undefined }; onNode(node);
    try {
      let url: string | undefined, assetId: string | undefined;
      if (settings.mode === 'image') {
        const source = upstream(node, graph, 'image')[0];
        assertCurrent();
        const result = await generateImage({ clientJobId: saved.jobId, model: settings.model, prompt, aspectRatio: settings.aspect,
          ...(source ? { sourceImage: imageOf(source) } : {}), txHash: receipt.txHash }, wallet);
        if (!result.success || !result.imageUrl) throw new Error(result.error || 'creatorFlow.runFailed');
        url = result.imageUrl; assetId = saved.jobId;
      } else {
        let ticket = saved.ticket;
        if (!ticket) {
          const start = upstream(node, graph, 'startFrame')[0], end = upstream(node, graph, 'endFrame')[0];
          const images = upstream(node, graph, 'image').map(imageOf), clips = upstream(node, graph, 'referenceVideo').map(source => String(source.node.data.videoUrl || ''));
          assertCurrent();
          const request = { clientJobId: saved.jobId, model: settings.model, prompt, aspectRatio: settings.aspect, resolution: settings.resolution,
            duration: `${settings.durationSeconds}s`, txHash: receipt.txHash,
            ...(start ? { sourceImage: imageOf(start) } : {}), ...(end ? { endFrameUrl: imageOf(end) } : {}),
            ...(images.length ? { referenceImageUrls: images } : {}), ...(clips.length ? { videoUrls: clips } : {}),
            ...(settings.seed ? { seed: Number(settings.seed) } : {}), ...(settings.negativePrompt ? { negativePrompt: settings.negativePrompt } : {}) };
          const result = await startVideoGeneration(request, wallet);
          if (result.status === 'failed') throw new Error(result.error || 'creatorFlow.runFailed');
          if (result.status === 'succeeded' && result.videoUrl) { url = result.videoUrl; assetId = result.libraryId || saved.jobId; }
          else if (result.predictionId) { ticket = { predictionId: result.predictionId, provider: result.provider, falAppId: result.falAppId }; saved.ticket = ticket; saved.state = 'polling'; await persist(); }
          else throw new Error('creatorFlow.runFailed');
        }
        if (ticket && !url) {
          const deadline = Date.now() + 12 * 60 * 1000;
          while (Date.now() < deadline) {
            assertCurrent();
            const result = await pollVideoGeneration(ticket.predictionId, { provider: ticket.provider, falAppId: ticket.falAppId, walletAddress: wallet });
            if (result.status === 'failed') throw new Error(result.error || 'creatorFlow.runFailed');
            if (result.status === 'succeeded' && result.videoUrl) { url = result.videoUrl; assetId = result.libraryId || saved.jobId; break; }
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          if (!url) throw new Error('creatorFlow.recoveryPending');
        }
      }
      assertCurrent();
      if (!url || !assetId) throw new Error('creatorFlow.runFailed');
      await saveCreatorAsset({ id: assetId, kind: settings.mode === 'image' ? 'image' : 'video', model: settings.model, modelName: settings.model,
        prompt, aspect: settings.aspect, createdAt: Date.now(), url }, wallet);
      saved.assetId = assetId; saved.state = 'done'; delete saved.error; await persist();
      assertCurrent();
      node.data = { ...node.data, outputAssetId: assetId, ...(settings.mode === 'image' ? { imageUrl: url } : { videoUrl: url }), status: 'done' };
      onNode(node);
    } catch (error) {
      saved.error = error instanceof Error ? error.message : 'creatorFlow.runFailed';
      // Keep the same job/ticket for recovery; a retry never invents a new paid job.
      saved.state = saved.ticket ? 'polling' : 'error'; await persist();
      if (isCurrent()) onNode({ ...node, data: { ...node.data, status: 'error', errorMsg: saved.error } });
      throw error;
    }
  }
}
