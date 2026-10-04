import React, { memo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../context/AuthContext';
import { listCreatorAssets } from '../../services/creator.service';
import type { CreatorMode, CreatorReferenceAsset } from '../../libs/creatorStudio';
import { toastError } from '../../libs/toast';
import CreatorMediaPreview from './CreatorMediaPreview';

interface Props {
  assets: CreatorReferenceAsset[];
  mode: CreatorMode;
  onChange: (assets: CreatorReferenceAsset[]) => void;
  onMention: (tag: string) => void;
  pickerVisible: boolean;
  onClose: () => void;
  disabled: boolean;
}

export default memo(function CreatorReferenceAssets({ assets, mode, onChange, onMention, pickerVisible, onClose, disabled }: Props) {
  const { t } = useTranslation();
  const user = useUser();
  const wallet = user?.walletAddress || user?.address;
  const [libraryVisible, setLibraryVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const library = useInfiniteQuery({ queryKey: ['creator-library', wallet], initialPageParam: 0,
    queryFn: ({ pageParam }) => listCreatorAssets(pageParam), getNextPageParam: page => page.nextOffset ?? undefined,
    enabled: libraryVisible && !!wallet });
  const add = (incoming: CreatorReferenceAsset[]) => {
    const all = [...assets, ...incoming].filter((asset, i, list) => list.findIndex(a => a.uri === asset.uri) === i);
    if (all.filter(a => a.kind === 'video').length > 1) { toastError(t('creator.referenceOneClip')); return; }
    if (all.filter(a => a.kind === 'image').length > 4) { toastError(t('creator.referenceFourImages')); return; }
    onChange(mode === '3d' ? incoming.filter(a => a.kind === 'image').slice(0, 1) : all);
    onClose(); setLibraryVisible(false);
  };
  const pick = async (video: boolean) => {
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: video ? ['videos'] : ['images'],
        allowsMultipleSelection: !video && mode !== '3d', selectionLimit: mode === '3d' ? 1 : 4, quality: 1 });
      if (result.canceled) return;
      const selected: CreatorReferenceAsset[] = [];
      for (const asset of result.assets) {
        if ((asset.fileSize ?? 0) > (video ? 100 : 20) * 1024 * 1024) { toastError(t('creator.fileTooLarge', { max: video ? 100 : 20 })); return; }
        const seconds = video ? (asset.duration ?? 0) / 1000 : undefined;
        if (video && (!seconds || seconds < 3 || seconds > 30 || !/\.(mp4|mov)(?:\?|$)/i.test(asset.fileName ?? asset.uri))) {
          toastError(t('creator.referenceClipLength')); return;
        }
        selected.push({ uri: asset.uri, label: asset.fileName ?? (video ? '@Video1' : '@Image1'), kind: video ? 'video' : 'image', seconds });
      }
      add(selected);
    } catch { toastError(t('aiChat.couldNotReadImage')); }
    finally { setBusy(false); }
  };
  let imageNumber = 0;
  const choices = (library.data?.pages.flatMap(page => page.jobs) ?? []).filter(job => job.url && (job.kind === 'image' || (mode === 'video' && job.kind === 'video')));
  return <View className="px-4 pb-2">
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {assets.map(asset => {
        const tag = asset.kind === 'video' ? '@Video1' : `@Image${++imageNumber}`;
        return <View key={asset.uri} className="flex-row items-center gap-2 rounded-xl border border-theme-neutrals-700 bg-theme-neutrals-800 p-1">
          <CreatorMediaPreview kind={asset.kind} url={asset.uri} posterUrl={asset.posterUrl} width={40} height={40} />
          <Pressable onPress={() => onMention(tag)} disabled={disabled} accessibilityLabel={t('creator.referenceInsert', { tag })} accessibilityRole="button">
            <Text className="text-xs font-bold text-theme-neutrals-100">{tag}</Text>
            <Text className="max-w-[100px] text-[10px] text-theme-neutrals-400" numberOfLines={1}>{asset.label}</Text>
          </Pressable>
          <Pressable onPress={() => onChange(assets.filter(a => a.uri !== asset.uri))} disabled={disabled} accessibilityLabel={t('common.delete')} accessibilityRole="button" className="p-2"><Text className="text-theme-neutrals-400">×</Text></Pressable>
        </View>;
      })}
    </ScrollView>
    <Pressable onPress={() => setLibraryVisible(true)} disabled={disabled} accessibilityRole="button" className="mt-2 self-start rounded-lg border border-theme-neutrals-700 px-3 py-1.5"><Text className="text-xs text-theme-neutrals-300">{t('creator.referenceLibrary')}</Text></Pressable>
    {!!assets.length && <Text className="mt-1 text-[11px] text-theme-neutrals-400">{t(mode === '3d' ? 'creator.referenceSingle' : 'creator.referenceHint')}</Text>}
    <Modal visible={pickerVisible || libraryVisible} transparent animationType="slide" onRequestClose={() => { onClose(); setLibraryVisible(false); }}>
      <View className="flex-1 justify-end bg-black/70">
        <Pressable className="flex-1" onPress={() => { onClose(); setLibraryVisible(false); }} accessibilityLabel={t('common.close')} />
        <View className="max-h-[75%] rounded-t-3xl bg-theme-neutrals-900 p-4 pb-8">
          <Text className="mb-3 text-lg font-bold text-theme-neutrals-100">{t('dm.attachImage')}</Text>
          {busy && <ActivityIndicator />}
          {!libraryVisible ? <>
            <Pressable onPress={() => void pick(false)} disabled={busy} className="mb-2 rounded-xl bg-theme-neutrals-800 p-4"><Text className="text-theme-neutrals-100">{t('creator.navImage')}</Text></Pressable>
            {mode === 'video' && <Pressable onPress={() => void pick(true)} disabled={busy} className="mb-2 rounded-xl bg-theme-neutrals-800 p-4"><Text className="text-theme-neutrals-100">{t('creator.referenceUploadClip')}</Text></Pressable>}
            <Pressable onPress={() => { onClose(); setLibraryVisible(true); }} className="rounded-xl bg-theme-neutrals-800 p-4"><Text className="text-theme-neutrals-100">{t('creator.referenceLibrary')}</Text></Pressable>
          </> : <ScrollView>
            {library.isLoading && <ActivityIndicator />}
            {!choices.length && <Text className="text-theme-neutrals-400">{t(wallet ? 'creator.libraryEmpty' : 'creator.signInToSee')}</Text>}
            {choices.map(job => <Pressable key={job.id} className="mb-2 flex-row items-center gap-3 rounded-xl bg-theme-neutrals-800 p-2" onPress={async () => {
              if (job.kind === 'video') {
                // A library video needs its metadata before the payment quote is prepared.
                try {
                  const info = await import('expo-video');
                  const player = info.createVideoPlayer(job.url!);
                  try {
                    const seconds = await new Promise<number>((resolve, reject) => {
                      const timer = setTimeout(() => { subscription.remove(); reject(new Error('No duration')); }, 10000);
                      const subscription = player.addListener('sourceLoad', event => { clearTimeout(timer); subscription.remove(); resolve(event.duration); });
                      if (player.duration > 0) { clearTimeout(timer); subscription.remove(); resolve(player.duration); }
                    });
                    if (seconds < 3 || seconds > 30) { toastError(t('creator.referenceClipLength')); return; }
                    add([{ uri: job.url!, label: job.prompt || job.modelName, kind: 'video', seconds, posterUrl: job.posterUrl }]);
                  } finally { player.release(); }
                } catch { toastError(t('creator.referenceClipLength')); }
              } else add([{ uri: job.url!, label: job.prompt || job.modelName, kind: 'image' }]);
            }}>
              <CreatorMediaPreview kind={job.kind} url={job.url} posterUrl={job.posterUrl} width={60} height={60} />
              <Text className="flex-1 text-xs text-theme-neutrals-100" numberOfLines={2}>{job.prompt || job.modelName}</Text>
            </Pressable>)}
            {library.hasNextPage && <Pressable onPress={() => void library.fetchNextPage()} disabled={library.isFetchingNextPage} className="p-3"><Text className="text-theme-neutrals-100">{t('explorePage.loadMore')}</Text></Pressable>}
          </ScrollView>}
          <Pressable onPress={() => { onClose(); setLibraryVisible(false); }} className="mt-3 self-end p-2"><Text className="text-theme-neutrals-100">{t('common.close')}</Text></Pressable>
        </View>
      </View>
    </Modal>
  </View>;
});
