/**
 * Creator Flow — client for the `creator-flows` edge function.
 * ============================================================
 * Mirrors dehubweb's src/lib/creator/flow/api.ts. A flow is the node graph
 * built on web's /creator/flow canvas: text, reference and generator nodes
 * wired together and stored as one jsonb blob per flow. The phone reads,
 * shares, renames, deletes and copies flows; building and running them stays
 * on the canvas.
 *
 * Wallet-native auth, the same headers builder-api takes. `fetchPublicFlow`
 * is the one call that needs no wallet.
 */
import { supabase } from './supabase';
import { dehubAuthHeaders } from './ai.service';

export type FlowNodeStatus = 'idle' | 'pending' | 'running' | 'done' | 'error';

/** The node data fields the phone reads. The blob carries more; it is kept as-is. */
export interface FlowNodeData extends Record<string, unknown> {
  label?: string;
  status?: FlowNodeStatus;
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  duration?: number;
  imageUrl?: string;
  videoUrl?: string;
  capturedFrameUrl?: string;
  outputText?: string;
  localPrompt?: string;
  generations?: Array<string | { error: string } | null>;
  currentGenIdx?: number;
  memberIds?: string[];
  jobId?: string;
  pendingGenerate?: boolean;
  pipelineQueued?: boolean;
}

export interface FlowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: FlowNodeData;
  [key: string]: unknown;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  [key: string]: unknown;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface PublicFlow {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: Viewport | null;
  coverUrl: string | null;
  updatedAt: string;
}

export interface RemoteFlow {
  id: string;
  name: string;
  isPublic: boolean;
  coverUrl: string | null;
  data: {
    nodes?: FlowNode[];
    edges?: FlowEdge[];
    nodeCounters?: Record<string, number>;
    viewport?: Viewport;
    createdAt?: number;
    updatedAt?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export const SIGN_IN_REQUIRED = 'SIGN_IN_REQUIRED';

async function readError(error: unknown, data: unknown): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    const payload = await ctx.json().catch(() => null);
    if (payload?.error) return String(payload.error);
  }
  if ((data as { error?: string } | null)?.error) return String((data as { error: string }).error);
  return (error as Error | null)?.message || 'Flow request failed';
}

async function invokeFlows<T>(body: Record<string, unknown>, wallet: string | null): Promise<T> {
  let headers: Record<string, string> = {};
  if (wallet !== null) {
    headers = await dehubAuthHeaders(wallet);
    if (!headers['x-dehub-token'] || !wallet) throw new Error(SIGN_IN_REQUIRED);
  }
  const { data, error } = await supabase.functions.invoke('creator-flows', { body, headers });
  if (error) throw new Error(await readError(error, data));
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export const listFlows = (wallet: string) =>
  invokeFlows<{ flows: RemoteFlow[] }>({ action: 'list' }, wallet).then((r) => r.flows ?? []);

/** Upserts the given flows. Never deletes: the phone only ever sends the ones it changed. */
export const saveFlows = (wallet: string, flows: Array<Pick<RemoteFlow, 'id' | 'name' | 'isPublic' | 'data'>>) =>
  invokeFlows<{ ok: true; savedAt: string }>({ action: 'save', flows, deleteMissing: false }, wallet);

export const removeFlow = (wallet: string, id: string) => invokeFlows<{ ok: true }>({ action: 'remove', id }, wallet);

export const publishFlow = (wallet: string, id: string, isPublic: boolean) =>
  invokeFlows<{ ok: true; isPublic: boolean }>({ action: 'publish', id, isPublic }, wallet);

export const fetchPublicFlow = (id: string) =>
  invokeFlows<{ flow: PublicFlow }>({ action: 'public', id }, null).then((r) => r.flow);

/** Same id shape the web store mints, so a copy made here is indistinguishable there. */
export const flowUid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/**
 * A fresh private copy of someone's flow, ready for `saveFlows`: statuses and
 * in-flight job ids are cleared so nothing on it looks like it is running.
 */
export function copyOfFlow(flow: Pick<PublicFlow, 'name' | 'nodes' | 'edges'>, name: string) {
  const counters: Record<string, number> = {};
  for (const n of flow.nodes) counters[n.type ?? 'node'] = (counters[n.type ?? 'node'] ?? 0) + 1;
  const now = Date.now();
  return {
    id: flowUid(),
    name,
    isPublic: false,
    data: {
      nodes: flow.nodes.map((n) => ({
        ...n,
        selected: false,
        data: { ...n.data, status: 'idle' as const, jobId: undefined, pendingGenerate: false, pipelineQueued: false },
      })),
      edges: flow.edges,
      nodeCounters: counters,
      createdAt: now,
      updatedAt: now,
    },
  };
}

/** The same flow with a new name, for `saveFlows`. */
export function renamedFlow(row: RemoteFlow, name: string) {
  return { id: row.id, name, isPublic: row.isPublic, data: { ...row.data, updatedAt: Date.now() } };
}

/**
 * Nodes in reading order for a phone: groups dropped (they are canvas
 * furniture), then a topological order over the edges so every node comes
 * after the ones feeding it, ties broken by canvas position top-left first.
 */
export function orderNodes(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const real = nodes.filter((n) => n.type !== 'groupNode');
  const ids = new Set(real.map((n) => n.id));
  const incoming = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const n of real) incoming.set(n.id, 0);
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
  }
  const byPos = (a: FlowNode, b: FlowNode) =>
    (a.position?.x ?? 0) - (b.position?.x ?? 0) || (a.position?.y ?? 0) - (b.position?.y ?? 0);
  const byId = new Map(real.map((n) => [n.id, n]));
  const ready = real.filter((n) => (incoming.get(n.id) ?? 0) === 0).sort(byPos);
  const ordered: FlowNode[] = [];
  while (ready.length) {
    const n = ready.shift()!;
    ordered.push(n);
    for (const next of out.get(n.id) ?? []) {
      const left = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, left);
      if (left === 0) {
        ready.push(byId.get(next)!);
        ready.sort(byPos);
      }
    }
  }
  // A cycle cannot be built on the canvas, but never drop a node if one is.
  for (const n of real) if (!ordered.includes(n)) ordered.push(n);
  return ordered;
}

/** The result a node currently shows, if any. */
export function nodeOutput(node: FlowNode): { image?: string; video?: string; text?: string } {
  const d = node.data ?? {};
  const gens = Array.isArray(d.generations) ? d.generations : [];
  const idx = typeof d.currentGenIdx === 'number' ? d.currentGenIdx : gens.length - 1;
  const gen = gens[idx];
  const genUrl = typeof gen === 'string' ? gen : undefined;
  switch (node.type) {
    case 'imageGenNode':
      return { image: genUrl ?? d.imageUrl };
    case 'videoGenNode':
      return { video: genUrl ?? d.videoUrl };
    case 'imageInputNode':
      return { image: d.imageUrl };
    case 'videoInputNode':
      return { video: d.videoUrl };
    case 'assistantNode':
      return { text: d.outputText };
    default:
      return {};
  }
}
