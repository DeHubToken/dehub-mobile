import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { DIGITAL_PURCHASES_ENABLED } from '../config/storefront';
import { graphOrder, GENERATORS, connectedText, durableFlowNodes } from '../libs/creatorFlowGraph';
import { CREATOR_DEFAULTS, creatorInputIssue, creatorPromptLimit, normalizeCreatorSettings, type CreatorStudioSettings } from '../libs/creatorStudio';
import { generateImage, startVideoGeneration, pollVideoGeneration, quoteAiJob, type AiQuoteRequest } from './ai.service';
import { saveCreatorAsset } from './creator.service';
import { runCreatorAudio } from './creator-audio.service';
import { creatorAudioIssue, CREATOR_AUDIO_VOICES, type CreatorAudioSettings } from '../libs/creatorAudio';
import { supabase } from './supabase';
import { dehubAuthHeaders } from './ai.service';
import { downloadFlowAudio } from './creator-flow-download';
import { loadFlowAssets, flowAssetId, assetNodePatch } from './creator-flow-assets';
import type { FlowNode, FlowEdge } from './creator-flows.service';

export interface NativeFlowGraph { id: string; nodes: FlowNode[]; edges: FlowEdge[] }
export interface NativeFlowPlan { graph: NativeFlowGraph; signature: string; order: string[]; priceDhb: number; priceUsd: number; resume: boolean }
interface NodeReceipt { jobId: string; state: 'submitting' | 'polling' | 'done' | 'error'; paid?: boolean; terminalReleased?: boolean; freeSubmitted?: boolean; ticket?: { predictionId: string; provider?: string; falAppId?: string }; assetId?: string; outputText?: string; localOutput?: { audioUrl?: string; transcript?: string }; error?: string }
export interface NativeFlowReceipt { signature: string; txHash: string; expectedPaidNodeIds?: string[]; nodes: Record<string, NodeReceipt> }
type Quote = AiQuoteRequest & { resolution?: string; hasEndFrame?: boolean; hasAudioReferences?: boolean; hasVideoReferences?: boolean; hasInlineMedia?: boolean };
const activeRuns = new Set<string>();
const activeStarts = new Set<string>();
function unfinished(receipt: NativeFlowReceipt) {
  if (!receipt.expectedPaidNodeIds && receipt.txHash !== 'free') return true;
  return (receipt.expectedPaidNodeIds || []).some(id => !receipt.nodes[id] || receipt.nodes[id].state !== 'done' && !receipt.nodes[id].terminalReleased) || Object.values(receipt.nodes).some(node => node.state !== 'done' && node.paid !== false && !node.terminalReleased);
}
function released(result: unknown): boolean {
  const data = result as { paymentRestored?: unknown; paymentNotTaken?: unknown } | null;
  return data?.paymentRestored === true || data?.paymentNotTaken === true;
}
function preparedReceipt(plan: NativeFlowPlan, txHash: string, previous?: NativeFlowReceipt): NativeFlowReceipt {
  const nodes = { ...previous?.nodes }, expectedPaidNodeIds: string[] = [];
  for (const id of plan.order) {
    const type = plan.graph.nodes.find(node => node.id === id)?.type;
    const paid = type === 'imageGenNode' || type === 'videoGenNode';
    if (paid) expectedPaidNodeIds.push(id);
    if (!nodes[id]) nodes[id] = { jobId: Crypto.randomUUID(), state: 'submitting', paid };
  }
  return { signature: plan.signature, txHash: previous?.txHash || txHash, expectedPaidNodeIds, nodes };
}

function receiptKey(wallet: string, id: string) { return `creator-flow-run-v1:${wallet.toLowerCase()}:${id}`; }
const fingerprint = (graph: NativeFlowGraph) => JSON.stringify({ nodes: durableFlowNodes(graph.nodes).map(node => ({ id: node.id, type: node.type,
  data: Object.fromEntries(Object.entries(node.data).filter(([key]) => !['status','errorMsg','hasError','jobId','pendingGenerate','pipelineQueued','generations','currentGenIdx','outputText','outputAssetId',
    ...(GENERATORS.has(node.type || '') ? ['imageUrl','videoUrl','audioUrl','audioAssetId'] : [])].includes(key))) })), edges: graph.edges });

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
    ...(node.data.effect ? { effect: String(node.data.effect) } : {}),
    referenceAssets: [...references.map(source => ({ uri: imageOf(source) || 'https://pending.invalid/image', label: source.node.data.label || source.node.id, kind: 'image' as const })),
      ...videos.map(source => ({ uri: String(source.node.data.videoUrl || 'https://pending.invalid/video'), label: source.node.data.label || source.node.id, kind: 'video' as const,
        ...(source.node.data.videoDuration ? { seconds: Number(source.node.data.videoDuration) } : {}) }))],
    ...(endFrame ? { endFrame: { uri: imageOf(endFrame) || 'https://pending.invalid/image', label: endFrame.node.id, kind: 'image' as const } } : {}) };
}
function audioSettings(node: FlowNode, media?: CreatorAudioSettings['media']): CreatorAudioSettings {
  const task = String(node.data.audioTask || 'speech');
  if (!['speech','sfx','transcribe','isolate'].includes(task)) throw new Error('creator.audioInvalidTask');
  return { task: task as CreatorAudioSettings['task'], voiceId: String(node.data.voiceId || CREATOR_AUDIO_VOICES[0].id),
    ...(task === 'sfx' && node.data.duration !== undefined ? { durationSeconds: Number(node.data.duration) } : {}), ...(media ? { media } : {}) };
}
function validateNode(node: FlowNode, graph: NativeFlowGraph): CreatorStudioSettings | null {
  if (node.type === 'assistantNode') {
    const source = upstream(node, graph, 'prompt')[0]?.node;
    if (!source && !String(node.data.localPrompt || '').trim() || source?.type === 'promptNode' && !String(source.data.prompt || '').trim()) throw new Error('creatorFlow.missingPrompt');
    return null;
  }
  if (node.type === 'audioGenNode') {
    const settings = audioSettings(node), transform = settings.task === 'transcribe' || settings.task === 'isolate';
    const source = upstream(node, graph, transform ? 'audio' : 'prompt')[0]?.node;
    if (!source) throw new Error(transform ? 'creator.audioNeedsFile' : 'creatorFlow.missingPrompt');
    if (transform && source.type === 'audioInputNode' && (!source.data.audioUrl || !source.data.audioAssetId)) throw new Error('creatorFlow.missingSavedMedia');
    const prompt = connectedText(node, graph.nodes, graph.edges);
    const issue = creatorAudioIssue(prompt || (source.type !== 'promptNode' ? 'pending' : ''), transform ? { ...settings, media: { uri: 'https://pending.invalid/audio', name: 'source.mp3', mimeType: 'audio/mpeg', size: 1 } } : settings);
    if (issue) throw new Error(issue);
    return null;
  }
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
  if (receipt && !resume && unfinished(receipt)) throw new Error('creatorFlow.recoverBeforeEdit');
  if (resume && order.every(id => receipt!.nodes[id]?.state === 'done' || receipt!.nodes[id]?.terminalReleased)) throw new Error('creatorFlow.runAlreadyComplete');
  const prepared = await hydrate(graph, wallet);
  let priceDhb = 0, priceUsd = 0;
  for (const id of order) {
    const node = prepared.nodes.find(node => node.id === id)!, settings = validateNode(node, prepared);
    if (resume && receipt!.nodes[id]?.state === 'done') continue;
    if (!settings) continue;
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
    if (result.expectedPaidNodeIds !== undefined && (!Array.isArray(result.expectedPaidNodeIds) || result.expectedPaidNodeIds.length > 100 || result.expectedPaidNodeIds.some((id: unknown) => typeof id !== 'string' || !id || id.length > 128))) throw new Error('Invalid receipt');
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
  if (receipt && unfinished(receipt)) throw new Error('creatorFlow.recoverBeforeEdit');
  await AsyncStorage.removeItem(receiptKey(wallet, flowId));
}

/** Serialize payment admission even when an editor is closed and reopened. */
export function claimNativeFlowStart(wallet: string, flowId: string): () => void {
  const key = receiptKey(wallet, flowId);
  if (activeStarts.has(key) || activeRuns.has(key)) throw new Error('creatorFlow.recoveryPending');
  activeStarts.add(key);
  return () => { activeStarts.delete(key); };
}

/** Save returned payment references even if the UI closes or the account changes. */
export async function reserveNativeFlowReceipt(plan: NativeFlowPlan, wallet: string, txHash: string): Promise<NativeFlowReceipt> {
  if (!txHash || fingerprint(plan.graph) !== plan.signature) throw new Error('creatorFlow.planChanged');
  const previous = await readNativeFlowReceipt(wallet, plan.graph.id);
  if (previous && previous.signature === plan.signature) {
    const receipt = preparedReceipt(plan, txHash, previous);
    await AsyncStorage.setItem(receiptKey(wallet, plan.graph.id), JSON.stringify(receipt)); return receipt;
  }
  if (previous && unfinished(previous)) throw new Error('creatorFlow.recoverBeforeEdit');
  const receipt = preparedReceipt(plan, txHash);
  await AsyncStorage.setItem(receiptKey(wallet, plan.graph.id), JSON.stringify(receipt));
  return receipt;
}

/** Explicitly retry one free task without discarding prepaid downstream work. */
export async function retryNativeFlowFreeNode(wallet: string, flowId: string, nodeId: string): Promise<void> {
  const key = receiptKey(wallet, flowId);
  if (activeRuns.has(key) || activeStarts.has(key)) throw new Error('creatorFlow.recoveryPending');
  const receipt = await readNativeFlowReceipt(wallet, flowId), node = receipt?.nodes[nodeId];
  if (!receipt || !node || node.paid !== false || node.state === 'done') throw new Error('creatorFlow.recoverBeforeEdit');
  node.freeSubmitted = false; node.state = 'submitting'; delete node.error;
  await AsyncStorage.setItem(key, JSON.stringify(receipt));
}

/** Revalidate the reviewed run and retain payment before any UI identity exit. */
export async function admitNativeFlowRun(reviewed: NativeFlowPlan, graph: NativeFlowGraph, wallet: string, callbacks: {
  isCurrent: () => boolean; saveDraft: () => Promise<unknown>; pay: (priceDhb: number) => Promise<string>;
  onNode: (node: FlowNode) => void; onPriceChanged?: (plan: NativeFlowPlan) => void;
}): Promise<boolean> {
  if (!DIGITAL_PURCHASES_ENABLED && graph.nodes.some(node => node.type === 'imageGenNode' || node.type === 'videoGenNode')) throw new Error('creatorFlow.paidUnavailable');
  if (!callbacks.isCurrent()) throw new Error('SIGN_IN_REQUIRED');
  const release = claimNativeFlowStart(wallet, graph.id);
  try {
    const fresh = await planNativeFlow(graph, wallet);
    if (!callbacks.isCurrent()) return false;
    if (fresh.signature !== reviewed.signature || Math.abs(fresh.priceDhb - reviewed.priceDhb) > 0.00000001 || fresh.resume !== reviewed.resume) {
      callbacks.onPriceChanged?.(fresh); throw new Error('creatorFlow.planChanged');
    }
    await callbacks.saveDraft();
    if (!callbacks.isCurrent()) return false;
    const previous = await readNativeFlowReceipt(wallet, graph.id);
    if (!callbacks.isCurrent()) return false;
    const payable = await planNativeFlow(graph, wallet);
    if (!callbacks.isCurrent()) return false;
    if (payable.signature !== reviewed.signature || Math.abs(payable.priceDhb - reviewed.priceDhb) > 0.00000001 || payable.resume !== reviewed.resume) {
      callbacks.onPriceChanged?.(payable); throw new Error('creatorFlow.planChanged');
    }
    const txHash = reviewed.resume && previous ? previous.txHash : reviewed.priceDhb > 0 ? await callbacks.pay(reviewed.priceDhb) : 'free';
    await reserveNativeFlowReceipt(reviewed, wallet, txHash);
    if (!callbacks.isCurrent()) return false;
    await runNativeFlow(reviewed, wallet, txHash, callbacks.isCurrent, callbacks.onNode);
    return callbacks.isCurrent();
  } finally { release(); }
}

/** Receipt/job IDs stay in account-scoped local storage, outside public graph JSON. */
export async function runNativeFlow(plan: NativeFlowPlan, wallet: string, txHash: string,
  isCurrent: () => boolean, onNode: (node: FlowNode) => void): Promise<void> {
  if (!DIGITAL_PURCHASES_ENABLED && plan.graph.nodes.some(node => node.type === 'imageGenNode' || node.type === 'videoGenNode')) throw new Error('creatorFlow.paidUnavailable');
  const assertCurrent = () => { if (!isCurrent()) throw new Error('SIGN_IN_REQUIRED'); };
  assertCurrent();
  if (fingerprint(plan.graph) !== plan.signature) throw new Error('creatorFlow.planChanged');
  const activeKey = receiptKey(wallet, plan.graph.id);
  if (activeRuns.has(activeKey)) throw new Error('creatorFlow.recoveryPending');
  activeRuns.add(activeKey);
  try {
  let receipt = await readNativeFlowReceipt(wallet, plan.graph.id);
  if (receipt && receipt.signature !== plan.signature && unfinished(receipt)) throw new Error('creatorFlow.recoverBeforeEdit');
  receipt = preparedReceipt(plan, txHash, receipt?.signature === plan.signature ? receipt : undefined);
  const persist = () => AsyncStorage.setItem(receiptKey(wallet, plan.graph.id), JSON.stringify(receipt));
  await persist();
  const graph = await hydrate(plan.graph, wallet);
  for (const id of plan.order) {
    assertCurrent();
    const node = graph.nodes.find(node => node.id === id)!;
    let saved = receipt.nodes[id];
    if (saved?.outputText && node.type === 'assistantNode') {
      saved.state = 'done'; await persist();
      node.data = { ...node.data, outputText: saved.outputText, status: 'done' }; onNode(node); continue;
    }
    if (saved?.state === 'done' && saved.assetId) {
      const assets = await loadFlowAssets(wallet, [saved.assetId]); assertCurrent();
      const asset = assets.get(saved.assetId);
      if (!asset) throw new Error('creatorFlow.missingSavedMedia');
      node.data = { ...node.data, ...assetNodePatch(node, asset), outputAssetId: saved.assetId, ...(node.type === 'audioGenNode' ? { audioAssetId: saved.assetId } : {}), status: 'done' };
      onNode(node); continue;
    }
    if (saved?.freeSubmitted && !saved.localOutput && !saved.outputText && saved.state !== 'done') {
      onNode({ ...node, data: { ...node.data, status: 'error', errorMsg: 'creatorFlow.freeResultUnknown' } });
      throw new Error('creatorFlow.freeResultUnknown');
    }
    if (!saved) { saved = { jobId: Crypto.randomUUID(), state: 'submitting', paid: node.type === 'imageGenNode' || node.type === 'videoGenNode' }; receipt.nodes[id] = saved; await persist(); }
    const settings = validateNode(node, graph);
    const prompt = connectedText(node, graph.nodes, graph.edges).trim();
    if (!prompt && !(node.type === 'audioGenNode' && ['transcribe','isolate'].includes(String(node.data.audioTask)))) throw new Error('creatorFlow.missingPrompt');
    node.data = { ...node.data, status: 'running', errorMsg: undefined }; onNode(node);
    try {
      let url: string | undefined, assetId: string | undefined;
      if (node.type === 'assistantNode') {
        assertCurrent();
        const headers = await dehubAuthHeaders(wallet); assertCurrent();
        saved.freeSubmitted = true; await persist(); assertCurrent();
        const result = await supabase.functions.invoke('creator-prompt-assistant', { headers, body: { prompt, persona: 'rewrite', model: String(node.data.assistantModel || 'gemini-flash'), stream: false } });
        if (result.error || typeof result.data?.text !== 'string' || !result.data.text.trim()) throw new Error(result.data?.error || result.error?.message || 'creatorFlow.runFailed');
        saved.outputText = result.data.text.trim(); saved.state = 'done'; await persist(); assertCurrent();
        node.data = { ...node.data, outputText: saved.outputText, status: 'done' }; onNode(node); continue;
      }
      if (node.type === 'audioGenNode') {
        let output = saved.localOutput;
        if (!output) {
          const source = upstream(node, graph, 'audio')[0]?.node;
          let cleanup: (() => Promise<void>) | undefined;
          try {
            let media: CreatorAudioSettings['media'];
            if (source) {
              const sourceId = String(source.data.audioAssetId || '');
              if (!sourceId) throw new Error('creatorFlow.missingSavedMedia');
              const downloaded = await downloadFlowAudio(wallet, sourceId, saved.jobId, isCurrent); assertCurrent();
              cleanup = downloaded.cleanup;
              media = { uri: downloaded.uri, name: downloaded.name, mimeType: downloaded.mimeType, size: downloaded.size };
            }
            assertCurrent();
            saved.freeSubmitted = true; await persist(); assertCurrent();
            output = await runCreatorAudio(prompt, audioSettings(node, media), wallet);
            saved.localOutput = output; await persist();
          } finally { await cleanup?.(); }
        }
        assertCurrent();
        await saveCreatorAsset({ id: saved.jobId, kind: 'audio', model: String(node.data.audioTask || 'speech'), modelName: String(node.data.audioTask || 'speech'), prompt, createdAt: Date.now(),
          ...(output.audioUrl ? { url: output.audioUrl } : {}), ...(output.transcript ? { transcript: output.transcript } : {}) }, wallet);
        saved.assetId = saved.jobId; saved.state = 'done'; await persist(); assertCurrent();
        // Renew private audio through the library for downstream transformations.
        const assets = await loadFlowAssets(wallet, [saved.jobId]); assertCurrent();
        const asset = assets.get(saved.jobId);
        if (!asset) throw new Error('creatorFlow.missingSavedMedia');
        node.data = { ...node.data, ...assetNodePatch(node, asset), audioAssetId: saved.jobId, status: 'done' }; onNode(node); continue;
      }
      if (!settings) throw new Error('creatorFlow.unsupportedNode');
      if (settings.mode === 'image') {
        const source = upstream(node, graph, 'image')[0];
        assertCurrent();
        const result = await generateImage({ clientJobId: saved.jobId, model: settings.model, prompt, aspectRatio: settings.aspect,
          ...(source ? { sourceImage: imageOf(source) } : {}), txHash: receipt.txHash }, wallet);
        if (!result.success || !result.imageUrl) { saved.terminalReleased = released(result); throw new Error(result.error || 'creatorFlow.runFailed'); }
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
          if (settings.effect) Object.assign(request, { effect: settings.effect });
          const result = await startVideoGeneration(request, wallet);
          if (['failed','canceled','cancelled'].includes(result.status)) { saved.terminalReleased = released(result); throw new Error(result.error || 'creatorFlow.runFailed'); }
          if (result.status === 'succeeded' && result.videoUrl) { url = result.videoUrl; assetId = result.libraryId || saved.jobId; }
          else if (result.predictionId) { ticket = { predictionId: result.predictionId, provider: result.provider, falAppId: result.falAppId }; saved.ticket = ticket; saved.state = 'polling'; await persist(); }
          else throw new Error('creatorFlow.runFailed');
        }
        if (ticket && !url) {
          const deadline = Date.now() + 12 * 60 * 1000;
          while (Date.now() < deadline) {
            assertCurrent();
            const result = await pollVideoGeneration(ticket.predictionId, { provider: ticket.provider, falAppId: ticket.falAppId, walletAddress: wallet });
            if (['failed','canceled','cancelled'].includes(result.status)) { saved.terminalReleased = released(result); throw new Error(result.error || 'creatorFlow.runFailed'); }
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
  } finally { activeRuns.delete(activeKey); }
}
