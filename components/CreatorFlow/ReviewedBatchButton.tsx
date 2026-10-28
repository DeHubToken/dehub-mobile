import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ReviewedBatch } from '../../libs/reviewedBatch';
import type { RemoteFlow } from '../../services/creator-flows.service';
const FlowAuthor = lazy(() => import('./FlowAuthor'));

export function ReviewedBatchButton({ owner, scope, label, create, beforePrepare }: { owner: string | null; scope: string; label: string; create: () => ReviewedBatch; beforePrepare?: () => Promise<void> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [ready, setReady] = useState<{ flow: RemoteFlow; version: number }>();
  const identity = `${owner || ''}:${scope}`, epoch = useRef({ identity, version: 0 }), live = useRef(true);
  if (epoch.current.identity !== identity) epoch.current = { identity, version: epoch.current.version + 1 };
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { setBusy(false); setError(''); setReady(undefined); }, [identity]);
  const prepare = async () => {
    if (busy || !owner) return;
    const captured = epoch.current.version;
    const current = () => live.current && epoch.current.version === captured;
    setBusy(true); setError('');
    try {
      const batch = create(); await beforePrepare?.();
      if (!current()) return;
      const { prepareReviewedBatch } = await import('../../services/reviewed-batch-flow');
      const flow = await prepareReviewedBatch(batch, current);
      if (current()) setReady({ flow, version: captured });
    } catch (reason) { if (current()) setError(reason instanceof Error ? reason.message : 'creator.batchInvalid'); }
    finally { if (current()) setBusy(false); }
  };
  return <View className="mt-3">
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !owner }} disabled={busy || !owner} onPress={() => void prepare()} className="rounded-xl border border-theme-neutrals-500 px-3 py-3" style={{ opacity: busy || !owner ? 0.4 : 1 }}><Text className="text-sm text-theme-neutrals-100">{t(label)}</Text></Pressable>
    <Text className="mt-2 text-xs text-theme-neutrals-400">{t('creator.batchReviewHint')}</Text>
    {error && <Text accessibilityRole="alert" className="mt-2 text-xs text-theme-neutrals-100">{t(error, { defaultValue: error })}</Text>}
    {ready && owner && ready.version === epoch.current.version && <Suspense fallback={<ActivityIndicator />}><FlowAuthor key={`${owner}:${ready.flow.id}`} wallet={owner.toLowerCase()} flow={ready.flow} onClose={() => setReady(undefined)} onSaved={() => {}} /></Suspense>}
  </View>;
}
