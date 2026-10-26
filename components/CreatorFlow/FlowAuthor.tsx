import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DIGITAL_PURCHASES_ENABLED } from '../../config/storefront';
import { CREATOR_DEFAULTS, creatorModels } from '../../libs/creatorStudio';
import { graphOrder, inputRules, sourceMedia } from '../../libs/creatorFlowGraph';
import { useJobPayment } from '../../hooks/useAiPayment';
import { useWeb3Provider } from '../../hooks/use-web3';
import { useUser } from '../../context/AuthContext';
import OwnedFlowMedia from './OwnedFlowMedia';
import { listCreatorAssets, type CreatorAsset } from '../../services/creator.service';
import { flowUid, saveFlows, type FlowNode, type RemoteFlow } from '../../services/creator-flows.service';
import { admitNativeFlowRun, planNativeFlow, restartNativeFlowRun, retryNativeFlowFreeNode, type NativeFlowPlan } from '../../services/creator-flow-runner';

interface Props { wallet: string; flow?: RemoteFlow; onClose: () => void; onSaved: () => void }
const TYPES = ['promptNode','imageInputNode','videoInputNode','audioInputNode','imageGenNode','videoGenNode','audioGenNode','assistantNode'] as const;
const LABELS = { promptNode: 'nodeText', imageInputNode: 'nodeImageInput', videoInputNode: 'nodeVideoInput', audioInputNode: 'nodeAudioInput', imageGenNode: 'nodeImageGen', videoGenNode: 'nodeVideoGen', audioGenNode: 'nodeAudioGen', assistantNode: 'nodeAssistant' };
export default function FlowAuthor({ wallet, flow, onClose, onSaved }: Props) {
  const { t } = useTranslation(), insets = useSafeAreaInsets();
  const { account } = useWeb3Provider();
  const user = useUser();
  const signedOwner = (user?.walletAddress || user?.address || '').toLowerCase();
  const identity = useRef({ owner: signedOwner, account: account?.toLowerCase() || null });
  identity.current = { owner: signedOwner, account: account?.toLowerCase() || null };
  const payment = useJobPayment(DIGITAL_PURCHASES_ENABLED);
  const [id] = useState(flow?.id || flowUid());
  const [name, setName] = useState(flow?.name || '');
  const [nodes, setNodes] = useState<FlowNode[]>(() => JSON.parse(JSON.stringify(flow?.data.nodes || [])));
  const [edges, setEdges] = useState(flow?.data.edges || []);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [plan, setPlan] = useState<NativeFlowPlan | null>(null);
  const [libraryFor, setLibraryFor] = useState<string | null>(null), [assets, setAssets] = useState<CreatorAsset[]>([]);
  const [offset, setOffset] = useState<number | null>(0);
  const [preview, setPreview] = useState(false);
  const hasPaidNodes = nodes.some(node => node.type === 'imageGenNode' || node.type === 'videoGenNode');
  const live = useRef(true), working = useRef<FlowNode[]>(nodes);
  working.current = nodes;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const current = () => live.current && identity.current.owner === wallet.toLowerCase();
  const close = () => { live.current = false; onClose(); };
  const fail = (reason: unknown) => { if (current()) setError(reason instanceof Error ? t(reason.message, { defaultValue: reason.message }) : t('creatorFlow.syncError')); };
  const change = (nodeId: string, patch: Record<string, unknown>) => {
    setPlan(null); setNodes(previous => previous.map(node => node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node));
  };
  const payload = (items = working.current) => ({ id, name: name.trim() || t('creator.untitled'), isPublic: flow?.isPublic || false,
    data: { ...flow?.data, nodes: items, edges, updatedAt: Date.now(), createdAt: flow?.data.createdAt || Date.now() } });
  const save = async () => {
    if (busy) return; setBusy(true); setError('');
    try { graphOrder(nodes, edges); await saveFlows(wallet, [payload(nodes)]); if (current()) onSaved(); }
    catch (reason) { fail(reason); } finally { if (current()) setBusy(false); }
  };
  const prepare = async () => {
    if (busy) return; setBusy(true); setError('');
    try {
      const proposed = await planNativeFlow({ id, nodes, edges }, wallet);
      if (current()) setPlan(proposed);
    } catch (reason) { fail(reason); } finally { if (current()) setBusy(false); }
  };
  const execute = async () => {
    if (!plan || busy || !DIGITAL_PURCHASES_ENABLED && hasPaidNodes) return;
    setBusy(true); setError('');
    const capturedAccount = identity.current.account;
    const sameIdentity = () => current() && identity.current.account === capturedAccount;
    try {
      if (!sameIdentity()) throw new Error('SIGN_IN_REQUIRED');
      if (plan.priceDhb > 0 && !plan.resume && account?.toLowerCase() !== wallet.toLowerCase()) throw new Error('creatorFlow.connectOwnerWallet');
      const completed = await admitNativeFlowRun(plan, { id, nodes, edges }, wallet, {
        isCurrent: sameIdentity, saveDraft: () => saveFlows(wallet, [payload(nodes)]), pay: payment.payForJob,
        onPriceChanged: fresh => { if (sameIdentity()) setPlan(fresh); },
        onNode: changed => { working.current = working.current.map(node => node.id === changed.id ? changed : node); if (sameIdentity()) setNodes(working.current); },
      });
      if (!completed || !sameIdentity()) return;
      await saveFlows(wallet, [payload()]);
      if (sameIdentity()) { setPlan(null); onSaved(); }
    } catch (reason) { fail(reason); } finally { if (current()) setBusy(false); }
  };
  const moreAssets = async () => {
    if (offset === null || busy) return; setBusy(true); setError('');
    try {
      const page = await listCreatorAssets(offset);
      if (current()) { setAssets(previous => [...previous, ...page.jobs]); setOffset(page.nextOffset); }
    } catch (reason) { fail(reason); } finally { if (current()) setBusy(false); }
  };
  const add = (type: typeof TYPES[number]) => {
    const mode = type === 'videoGenNode' ? 'video' : 'image', defaults = CREATOR_DEFAULTS[mode];
    const node: FlowNode = { id: flowUid(), type, position: { x: nodes.length * 300, y: 0 }, data: { label: t(`creatorFlow.${LABELS[type]}`),
      ...(type === 'imageGenNode' || type === 'videoGenNode' ? { model: defaults.model, aspectRatio: defaults.aspect, duration: defaults.durationSeconds, resolution: defaults.resolution } : {}),
      ...(type === 'audioGenNode' ? { audioTask: 'speech' } : {}), ...(type === 'assistantNode' ? { assistantModel: 'gemini-flash' } : {}) } };
    setPlan(null); setNodes(previous => [...previous, node]);
  };
  const button = (label: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled} onPress={action} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  if (signedOwner !== wallet.toLowerCase()) return null;
  return <Modal visible animationType="slide" onRequestClose={close}>
    <View style={[styles.root, { paddingTop: insets.top + 10 }]}>
      <View style={styles.row}><Text style={styles.title}>{t('creatorFlow.formAuthor')}</Text>{button(t('creatorFlow.close'), close)}</View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.muted}>{t('creatorFlow.formAuthorHint')}</Text>
        <TextInput accessibilityLabel={t('creatorFlow.flowName')} value={name} editable={!busy} maxLength={120} onChangeText={value => { setName(value); setPlan(null); }} placeholder={t('creatorFlow.flowName')} placeholderTextColor="#71717a" style={styles.input} />
        <View style={styles.wrap}>{TYPES.map(type => <React.Fragment key={type}>{button(`+ ${t(`creatorFlow.${LABELS[type]}`)}`, () => add(type), busy || nodes.length >= 100)}</React.Fragment>)}</View>
        {nodes.map(node => <View key={node.id} style={styles.card}>
          <View style={styles.row}><Text style={styles.label}>{node.data.label || node.id}</Text>{button(t('creatorFlow.delete'), () => { setNodes(previous => previous.filter(item => item.id !== node.id)); setEdges(previous => previous.filter(edge => edge.source !== node.id && edge.target !== node.id)); setPlan(null); }, busy || !TYPES.includes(node.type as typeof TYPES[number]))}</View>
          {!TYPES.includes(node.type as typeof TYPES[number]) && <Text style={styles.muted}>{t('creatorFlow.unsupportedNode')}</Text>}
          {(node.type === 'promptNode' || node.type === 'assistantNode') && <TextInput accessibilityLabel={t('creatorFlow.nodeText')} multiline value={String((node.type === 'assistantNode' ? node.data.localPrompt : node.data.prompt) || '')} editable={!busy} onChangeText={prompt => change(node.id, node.type === 'assistantNode' ? { localPrompt: prompt } : { prompt })} style={[styles.input, { minHeight: 90 }]} />}
          {(node.type === 'imageInputNode' || node.type === 'videoInputNode' || node.type === 'audioInputNode') && <>
            <Text style={styles.muted}>{node.data.audioAssetId || node.data.inputAssetId || t('creatorFlow.chooseSavedMedia')}</Text>
            {button(t('creator.referenceLibrary'), () => { setLibraryFor(node.id); if (!assets.length) void moreAssets(); }, busy)}
          </>}
          {node.type === 'audioGenNode' && <>
            <View style={styles.wrap}>{(['speech','sfx','transcribe','isolate'] as const).map(task => <React.Fragment key={task}>{button(t(`creator.audioTask${task === 'speech' ? 'Speech' : task === 'sfx' ? 'Sfx' : task === 'transcribe' ? 'Transcribe' : 'Isolate'}Label`), () => {
              setEdges(previous => previous.filter(edge => edge.source !== node.id && edge.target !== node.id)); change(node.id, { audioTask: task, audioAssetId: undefined, audioUrl: undefined, outputText: undefined });
            }, busy)}</React.Fragment>)}</View>
            {(node.data.audioTask || 'speech') === 'speech' && <TextInput accessibilityLabel={t('creatorFlow.audioVoiceId')} value={String(node.data.voiceId || '')} editable={!busy} onChangeText={voiceId => change(node.id, { voiceId })} style={styles.input} />}
            {node.data.audioTask === 'sfx' && <TextInput accessibilityLabel={t('creatorFlow.audioSeconds')} value={String(node.data.duration || '')} editable={!busy} keyboardType="numeric" onChangeText={duration => change(node.id, { duration: Number(duration) })} style={styles.input} />}
          </>}
          {(node.type === 'imageGenNode' || node.type === 'videoGenNode') && <>
            <Text style={styles.muted}>{t('creatorFlow.model')}</Text>
            <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
              {creatorModels(node.type === 'imageGenNode' ? 'image' : 'video').map(model => <Pressable key={model.id} accessibilityRole="button" accessibilityState={{ selected: node.data.model === model.id }} disabled={busy} onPress={() => change(node.id, { model: model.id })} style={[styles.button, node.data.model === model.id && styles.selected]}><Text style={styles.buttonText}>{model.name}</Text></Pressable>)}
            </ScrollView>
            <TextInput accessibilityLabel={t('creatorFlow.aspectRatio')} value={String(node.data.aspectRatio || '')} editable={!busy} onChangeText={aspectRatio => change(node.id, { aspectRatio })} style={styles.input} />
            {node.type === 'videoGenNode' && <View style={styles.row}>
              <TextInput accessibilityLabel={t('creatorFlow.duration')} value={String(node.data.duration ?? '')} keyboardType="numeric" editable={!busy} onChangeText={duration => change(node.id, { duration: Number(duration) })} style={[styles.input, { flex: 1 }]} />
              <TextInput accessibilityLabel={t('creatorFlow.resolution')} value={String(node.data.resolution || '')} editable={!busy} onChangeText={resolution => change(node.id, { resolution })} style={[styles.input, { flex: 1 }]} />
            </View>}
          </>}
          {Object.entries(inputRules(node)).map(([handle, rule]) => <View key={handle} style={{ gap: 7 }}>
            <Text style={styles.label}>{t('creatorFlow.formInput', { handle })}</Text>
            {edges.filter(edge => edge.target === node.id && edge.targetHandle === handle).map(edge => <View key={edge.id} style={styles.row}><Text style={styles.muted}>{nodes.find(source => source.id === edge.source)?.data.label || edge.source}</Text>{button(t('creatorFlow.disconnect'), () => { setEdges(previous => previous.filter(item => item.id !== edge.id)); setPlan(null); }, busy)}</View>)}
            <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>{nodes.filter(source => source.id !== node.id && sourceMedia(source, source.type?.startsWith('video') ? 'video' : undefined) === rule.kind).map(source => <React.Fragment key={source.id}>{button(source.data.label || source.id, () => {
              setEdges(previous => [...previous.filter(edge => rule.max !== 1 || edge.target !== node.id || edge.targetHandle !== handle), { id: flowUid(), source: source.id, sourceHandle: source.type?.startsWith('video') ? 'video' : rule.kind === 'audio' ? 'audio' : undefined, target: node.id, targetHandle: handle }]); setPlan(null);
            }, busy)}</React.Fragment>)}</ScrollView>
          </View>)}
          {node.data.status && <Text style={styles.muted}>{t(`creatorFlow.status_${node.data.status}`)}</Text>}
          {!!node.data.errorMsg && <Text accessibilityRole="alert" style={styles.error}>{t(node.data.errorMsg, { defaultValue: node.data.errorMsg })}</Text>}
          {node.data.status === 'error' && (node.type === 'audioGenNode' || node.type === 'assistantNode') && button(t('creatorFlow.retryFreeTask'), () => {
            void retryNativeFlowFreeNode(wallet, id, node.id).then(() => { if (current()) change(node.id, { status: 'idle', errorMsg: undefined }); }).catch(fail);
          }, busy)}
          {!!node.data.outputText && <Text selectable style={styles.muted}>{node.data.outputText}</Text>}
        </View>)}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {busy && <ActivityIndicator color="white" />}
        {button(t('creatorFlow.save'), () => void save(), busy)}
        {button(t('creatorFlow.previewSavedMedia'), () => setPreview(true), busy)}
        {DIGITAL_PURCHASES_ENABLED || !hasPaidNodes ? button(t('creatorFlow.reviewRun'), () => void prepare(), busy || !nodes.length) : <Text style={styles.muted}>{t('creatorFlow.paidUnavailable')}</Text>}
        {plan && <View style={styles.card}>
          <Text style={styles.label}>{plan.resume ? t('creatorFlow.resumeRun') : t('creatorFlow.confirmPrice', { price: plan.priceDhb.toFixed(2) })}</Text>
          <Text style={styles.muted}>{t('creatorFlow.recoveryHint')}</Text>
          {button(plan.resume ? t('creatorFlow.resumeRun') : plan.priceDhb > 0 ? t('creatorFlow.payAndRun') : t('creatorFlow.run'), () => void execute(), busy)}
        </View>}
        {button(t('creatorFlow.newRun'), () => { void restartNativeFlowRun(wallet, id).then(() => { if (current()) { setPlan(null); setError(''); } }).catch(fail); }, busy)}
      </ScrollView>
      <Modal visible={!!libraryFor} transparent animationType="slide" onRequestClose={() => setLibraryFor(null)}>
        <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
          {button(t('creatorFlow.close'), () => setLibraryFor(null))}
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>{assets.filter(asset => asset.url && asset.kind === (nodes.find(node => node.id === libraryFor)?.type === 'audioInputNode' ? 'audio' : nodes.find(node => node.id === libraryFor)?.type === 'videoInputNode' ? 'video' : 'image')).map(asset => <React.Fragment key={asset.id}>{button(asset.prompt || asset.modelName, () => {
            if (libraryFor) change(libraryFor, asset.kind === 'audio' ? { audioAssetId: asset.id, audioUrl: asset.url } : { inputAssetId: asset.id, ...(asset.kind === 'image' ? { imageUrl: asset.url } : { videoUrl: asset.url }) }); setLibraryFor(null);
          })}</React.Fragment>)}{offset !== null && button(t('creatorFlow.loadMoreMedia'), () => void moreAssets(), busy)}</ScrollView>
        </View>
      </Modal>
      <Modal visible={preview} animationType="slide" onRequestClose={() => setPreview(false)}>
        <View style={[styles.root, { paddingTop: insets.top + 12 }]}>{button(t('creatorFlow.close'), () => setPreview(false))}<ScrollView contentContainerStyle={{ padding: 16 }}><OwnedFlowMedia wallet={wallet} nodes={nodes} edges={edges} /></ScrollView></View>
      </Modal>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#08090b' }, title: { color: 'white', fontSize: 19, fontWeight: '700', flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { borderWidth: 1, borderColor: '#303036', borderRadius: 12, padding: 12, gap: 10 }, label: { color: 'white', fontSize: 14, fontWeight: '600' },
  muted: { color: '#a1a1aa', fontSize: 13, flexShrink: 1 }, input: { color: 'white', borderWidth: 1, borderColor: '#42424a', borderRadius: 8, padding: 11 },
  button: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: '#42424a', borderRadius: 8, paddingHorizontal: 12 }, buttonText: { color: 'white', fontSize: 13 },
  disabled: { opacity: 0.4 }, selected: { borderColor: 'white', backgroundColor: '#303036' }, error: { color: '#fca5a5', fontSize: 13 } });
