import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../context/AuthContext';
import { assetNodePatch, flowAssetId, loadFlowAssets } from '../../services/creator-flow-assets';
import type { FlowNode, FlowEdge } from '../../services/creator-flows.service';
import FlowNodeList from './FlowNodeList';

/** Private media is renewed on request and never survives an account boundary. */
export default function OwnedFlowMedia({ wallet, nodes, edges }: { wallet: string; nodes: FlowNode[]; edges: FlowEdge[] }) {
  const { t } = useTranslation(), user = useUser();
  const owner = (user?.walletAddress || user?.address || '').toLowerCase();
  const liveOwner = useRef(owner); liveOwner.current = owner;
  const version = useRef(0);
  const [resolved, setResolved] = useState<{ owner: string; nodes: FlowNode[] } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const signature = JSON.stringify(nodes);
  useEffect(() => { version.current++; setResolved(null); setBusy(false); setError(''); return () => { version.current++; }; }, [wallet, owner, signature]);
  useEffect(() => {
    if (!resolved) return;
    const timer = setTimeout(() => setResolved(null), 50 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [resolved]);
  const load = async () => {
    if (busy || owner !== wallet.toLowerCase()) return;
    const epoch = ++version.current; setBusy(true); setError('');
    try {
      const assets = await loadFlowAssets(wallet, nodes.map(flowAssetId));
      if (version.current !== epoch || liveOwner.current !== wallet.toLowerCase()) return;
      const renewed = nodes.map(node => {
        const id = flowAssetId(node); if (!id) return node;
        const asset = assets.get(id); if (!asset) throw new Error('creatorFlow.missingSavedMedia');
        return { ...node, data: { ...node.data, ...assetNodePatch(node, asset) } };
      });
      setResolved({ owner: wallet.toLowerCase(), nodes: renewed });
    } catch (reason) { if (version.current === epoch) setError(reason instanceof Error ? t(reason.message, { defaultValue: reason.message }) : t('creatorFlow.loadFailed')); }
    finally { if (version.current === epoch) setBusy(false); }
  };
  if (owner !== wallet.toLowerCase()) return null;
  const safe = resolved?.owner === owner ? resolved.nodes : nodes.map(node => {
    if (!flowAssetId(node)) return node;
    return { ...node, data: { ...node.data, imageUrl: undefined, videoUrl: undefined, audioUrl: undefined, outputText: undefined, capturedFrameUrl: undefined, generations: undefined } };
  });
  return <View style={{ gap: 12 }}>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void load()} style={{ minHeight: 44, justifyContent: 'center', padding: 12, borderWidth: 1, borderColor: '#42424a', borderRadius: 8 }}><Text style={{ color: 'white' }}>{t('creatorFlow.previewSavedMedia')}</Text></Pressable>
    {busy && <ActivityIndicator color="white" />}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#fca5a5' }}>{error}</Text>}
    <FlowNodeList nodes={safe} edges={edges} />
  </View>;
}
