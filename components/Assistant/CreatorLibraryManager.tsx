import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { listCreatorAssets, updateCreatorSelection, type CreatorAsset, type LibraryOperation } from '../../services/creator.service';
import { libraryRequest } from '../../libs/libraryRequest';

export default function CreatorLibraryManager({ wallet }: { wallet?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'favorites' | 'hidden'>('all');
  const [rows, setRows] = useState<CreatorAsset[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const version = useRef(0), inFlight = useRef(false);
  const activeWallet = useRef(wallet); activeWallet.current = wallet;
  const read = async (offset = 0) => {
    if (!wallet || inFlight.current) return;
    const owner = wallet, request = ++version.current;
    inFlight.current = true; setBusy(true); setError(false);
    try {
      const page = await libraryRequest(listCreatorAssets(offset, { hidden: filter === 'hidden', favorites: filter === 'favorites' }));
      if (request !== version.current || activeWallet.current !== owner) return;
      setRows(previous => offset ? [...previous, ...page.jobs] : page.jobs); setNextOffset(page.nextOffset);
    } catch { if (request === version.current) setError(true); }
    finally { if (request === version.current) { inFlight.current = false; setBusy(false); } }
  };
  useEffect(() => {
    version.current++; inFlight.current = false; setBusy(false); setRows([]); setSelected([]); setNextOffset(null); setError(false);
    if (open && wallet) void read();
    return () => { version.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wallet, filter]);
  const change = async (operation: LibraryOperation) => {
    if (!wallet || !selected.length || inFlight.current) return;
    const owner = wallet, request = ++version.current;
    inFlight.current = true; setBusy(true); setError(false);
    try {
      const result = await libraryRequest(updateCreatorSelection(selected, operation, owner));
      if (activeWallet.current !== owner) return;
      void queryClient.invalidateQueries({ queryKey: ['creator-library', owner] });
      if (request !== version.current) return;
      const done = new Set(result.completedIds);
      const patch = operation === 'favorite' || operation === 'unfavorite' ? { favorite: operation === 'favorite' } : { hidden: operation === 'hide' };
      const updated = rows.map(row => done.has(row.id) ? { ...row, ...patch } : row)
        .filter(row => row.hidden === (filter === 'hidden') && (filter !== 'favorites' || row.favorite));
      setRows(updated);
      setNextOffset(offset => offset === null ? null : Math.max(0, offset - (rows.length - updated.length)));
      setSelected(previous => previous.filter(id => !done.has(id))); setError(result.incompleteIds.length > 0);
    } catch { if (request === version.current) setError(true); }
    finally { if (request === version.current) { inFlight.current = false; setBusy(false); } }
  };
  if (!wallet) return null;
  const Button = ({ text, onPress, disabled = false, selected: pressed = false }: { text: string; onPress(): void; disabled?: boolean; selected?: boolean }) => <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected: pressed }} disabled={disabled} onPress={onPress} className="min-h-11 justify-center rounded-lg border border-theme-neutrals-600 px-3 py-2" style={{ opacity: disabled ? 0.4 : 1 }}><Text className="text-theme-neutrals-100">{text}</Text></Pressable>;
  return <>
    <View className="px-4 py-2"><Button text={t('multiPost.manage')} onPress={() => setOpen(true)} /></View>
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <View className="flex-1 bg-theme-neutrals-900 px-4 pt-12">
        <View className="flex-row items-center justify-between pb-3"><Text className="text-xl text-theme-neutrals-100">{t('creator.referenceLibrary')}</Text><Button text={t('common.close')} onPress={() => setOpen(false)} /></View>
        <View className="flex-row flex-wrap gap-2 pb-3">
          <Button text={t('filters.all')} selected={filter === 'all'} disabled={busy} onPress={() => setFilter('all')} />
          <Button text={t('creator.libraryFavorites')} selected={filter === 'favorites'} disabled={busy} onPress={() => setFilter('favorites')} />
          <Button text={t('settings.hiddenOption')} selected={filter === 'hidden'} disabled={busy} onPress={() => setFilter('hidden')} />
        </View>
        <View className="flex-row flex-wrap items-center gap-2 pb-3">
          <Text className="text-theme-neutrals-100">{selected.length}/100</Text>
          <Button text={t('migrate.selectAll')} disabled={busy || !rows.length} onPress={() => setSelected(rows.slice(0, 100).map(row => row.id))} />
          <Button text={t('creator.libraryFavoriteAdd')} disabled={busy || !selected.length} onPress={() => void change('favorite')} />
          <Button text={t('creator.libraryFavoriteRemove')} disabled={busy || !selected.length} onPress={() => void change('unfavorite')} />
          <Button text={t(filter === 'hidden' ? 'editor.cloud.restore' : 'editor.layers.hide')} disabled={busy || !selected.length} onPress={() => void change(filter === 'hidden' ? 'restore' : 'hide')} />
        </View>
        {error && <View accessibilityLiveRegion="polite"><Text className="text-theme-neutrals-100">{t('common.somethingWentWrong')}</Text><Button text={t('common.retry')} disabled={busy} onPress={() => void read()} /></View>}
        {busy && <ActivityIndicator />}
        <FlatList data={rows} keyExtractor={row => row.id} renderItem={({ item }) => <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(item.id), disabled: busy }} disabled={busy || (!selected.includes(item.id) && selected.length >= 100)}
          onPress={() => setSelected(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id])} className="min-h-12 justify-center border-b border-theme-neutrals-700 py-3">
          <Text className="text-theme-neutrals-100">{selected.includes(item.id) ? '☑ ' : '☐ '}{item.favorite ? '★ ' : ''}{item.prompt || item.modelName}</Text>
        </Pressable>} onEndReached={() => { if (nextOffset !== null && !busy) void read(nextOffset); }} contentContainerStyle={{ paddingBottom: 32 }} />
      </View>
    </Modal>
  </>;
}
