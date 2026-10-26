/** Typed graph rules shared by canvas and form-based authoring. */
export type GraphMedia = 'prompt' | 'image' | 'video' | 'audio';
export interface GraphNode { id: string; type?: string; data: Record<string, unknown> }
export interface GraphEdge { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }
export const AUDIO_TASKS = ['speech', 'sfx', 'transcribe', 'isolate'] as const;
export type FlowAudioTask = typeof AUDIO_TASKS[number];
export const GENERATORS = new Set(['imageGenNode', 'videoGenNode', 'assistantNode', 'audioGenNode']);
export const GRAPH_NODE_TYPES = ['promptNode', 'imageInputNode', 'videoInputNode', 'audioInputNode', 'imageGenNode', 'videoGenNode', 'audioGenNode', 'assistantNode', 'groupNode'] as const;

export function sourceMedia(node: GraphNode | undefined, handle?: string | null): GraphMedia | null {
  if (!node) return null;
  if (node.type === 'promptNode' || node.type === 'assistantNode') return 'prompt';
  if (node.type === 'imageInputNode' || node.type === 'imageGenNode') return 'image';
  if (node.type === 'videoInputNode' || node.type === 'videoGenNode') return handle === 'frame' ? 'image' : 'video';
  if (node.type === 'audioInputNode') return 'audio';
  if (node.type === 'audioGenNode') return node.data.audioTask === 'transcribe' ? 'prompt' : 'audio';
  return null;
}
export function inputRules(node: GraphNode): Record<string, { kind: GraphMedia; max: number }> {
  switch (node.type) {
    case 'imageGenNode': return { prompt: { kind: 'prompt', max: 1 }, image: { kind: 'image', max: 1 } };
    case 'videoGenNode': return { prompt: { kind: 'prompt', max: 1 }, startFrame: { kind: 'image', max: 1 }, endFrame: { kind: 'image', max: 1 }, image: { kind: 'image', max: 4 }, referenceVideo: { kind: 'video', max: 2 } };
    case 'assistantNode': return { prompt: { kind: 'prompt', max: 1 } };
    case 'audioGenNode': return node.data.audioTask === 'transcribe' || node.data.audioTask === 'isolate'
      ? { audio: { kind: 'audio', max: 1 } } : { prompt: { kind: 'prompt', max: 1 } };
    default: return {};
  }
}

export function graphOrder(nodes: GraphNode[], edges: GraphEdge[]): string[] {
  if (nodes.length > 100 || edges.length > 300) throw new Error('creatorFlow.invalidGraph');
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length || nodes.some(node => !GRAPH_NODE_TYPES.includes(node.type as typeof GRAPH_NODE_TYPES[number]))) throw new Error('creatorFlow.invalidGraph');
  const remaining = new Map(nodes.map(node => [node.id, 0]));
  const counts = new Map<string, number>(), wires = new Set<string>();
  for (const edge of edges) {
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target || source.id === target.id) throw new Error('creatorFlow.invalidGraph');
    const handle = edge.targetHandle || '';
    const rule = inputRules(target)[handle];
    if (!rule || sourceMedia(source, edge.sourceHandle) !== rule.kind) throw new Error('creatorFlow.invalidGraph');
    const key = `${target.id}:${handle}`;
    const count = (counts.get(key) || 0) + 1; counts.set(key, count);
    const wire = `${edge.source}:${edge.sourceHandle || ''}:${key}`;
    if (count > rule.max || wires.has(wire)) throw new Error('creatorFlow.invalidGraph');
    wires.add(wire); remaining.set(target.id, remaining.get(target.id)! + 1);
  }
  const ready = nodes.filter(node => remaining.get(node.id) === 0).map(node => node.id), order: string[] = [];
  while (ready.length) {
    const id = ready.shift()!; order.push(id);
    for (const edge of edges.filter(edge => edge.source === id)) {
      const count = remaining.get(edge.target)! - 1; remaining.set(edge.target, count);
      if (!count) ready.push(edge.target);
    }
  }
  if (order.length !== nodes.length) throw new Error('creatorFlow.invalidGraph');
  return order;
}

export function connectedText(node: GraphNode, nodes: GraphNode[], edges: GraphEdge[]): string {
  const edge = edges.find(edge => edge.target === node.id && edge.targetHandle === 'prompt');
  const source = nodes.find(source => source.id === edge?.source);
  return String(source?.type === 'promptNode' ? source.data.prompt || '' : source?.data.outputText || (node.type === 'assistantNode' ? node.data.localPrompt || '' : ''));
}

/** Only a durable owned library reference is persisted for audio. */
export function durableFlowNodes<T extends GraphNode>(nodes: T[]): T[] {
  return nodes.map(node => {
    if (node.type !== 'audioGenNode' && node.type !== 'audioInputNode' && !node.data.inputAssetId && !node.data.outputAssetId) return node;
    const { audioUrl: _audioUrl, ...data } = node.data;
    if (node.data.inputAssetId || node.data.outputAssetId) { delete data.imageUrl; delete data.videoUrl; }
    return { ...node, data } as T;
  });
}
