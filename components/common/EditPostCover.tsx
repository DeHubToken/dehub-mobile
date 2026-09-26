import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, DeviceEventEmitter } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Ionicons } from '@expo/vector-icons';
import SmartImage from './SmartImage';
import { getNFT, replaceVideoCover } from '../../services/nft.service';
import { ensureMediaLibraryPermission } from '../../libs/permissions.util';
import { buildCdnPath, buildImageUrl, toastError, toastSuccess } from '../../libs';
import { MAX_IMAGE_UPLOAD_BYTES } from '../../libs/post-image-allowance';
import { prepareImageForUpload } from '../../libs/assets.util';

const FRAME_COUNT = 8;

/**
 * Pick a still from the published video, or upload one, as the post's cover.
 * Frames come off the native decoder, so they keep the clip's own shape.
 */
export default function EditPostCover({ tokenId, disabled, onBusyChange }: {
  tokenId: number | string; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useTranslation();
  const [cover, setCover] = useState<string | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [loadingFrames, setLoadingFrames] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingFrames(true);
    getNFT(tokenId).then(async ({ result }) => {
      if (!active) return;
      setCover(buildImageUrl(tokenId, result.imageUrl, 480) || null);
      const src = result.videoUrl?.startsWith('http') ? result.videoUrl : buildCdnPath(result.videoUrl);
      const duration = Number(result.videoDuration) || 0;
      if (!src || duration <= 0) return;
      const grabbed: string[] = [];
      for (let i = 0; i < FRAME_COUNT && active; i++) {
        const time = Math.round((duration / FRAME_COUNT) * (i + 0.5) * 1000);
        const shot = await VideoThumbnails.getThumbnailAsync(src, { time, quality: 0.9 }).catch(() => null);
        if (shot?.uri) grabbed.push(shot.uri);
        if (active) setFrames([...grabbed]);
      }
    }).catch(() => { /* Upload still works without a frame strip. */ })
      .finally(() => { if (active) setLoadingFrames(false); });
    return () => { active = false; };
  }, [tokenId]);

  const save = async (uri: string, name = 'cover.jpg', type = 'image/jpeg') => {
    if (busy || disabled) return;
    setBusy(true);
    onBusyChange(true);
    try {
      const imageUrl = await replaceVideoCover(tokenId, { uri, name, type });
      setCover(uri);
      DeviceEventEmitter.emit('post-cover-replaced', { tokenId: String(tokenId), imageUrl });
      toastSuccess(t('editPost.coverSaved'));
    } catch (error: any) {
      toastError(error?.message || t('editPost.coverFailed'));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  const upload = async () => {
    const permission = await ensureMediaLibraryPermission();
    if (!permission.granted) { toastError(t('editPost.mediaPermission')); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (picked.canceled || !picked.assets?.[0]) return;
    const image = await prepareImageForUpload(picked.assets[0]);
    if ((image.fileSize ?? 0) > MAX_IMAGE_UPLOAD_BYTES) { toastError(t('editPost.imageTooLarge')); return; }
    await save(image.uri, image.fileName || 'cover.jpg', image.mimeType || 'image/jpeg');
  };

  return <View className="mb-4">
    <Text className="text-zinc-300 text-sm mb-2">{t('editPost.coverTitle')}</Text>
    <Text className="text-zinc-400 text-xs mb-3">{t('editPost.coverHint')}</Text>
    <View className="rounded-xl border border-white/10 overflow-hidden bg-black mb-3" style={{ aspectRatio: 16 / 9 }}>
      {cover ? <SmartImage source={{ uri: cover }} recyclingKey={cover} style={{ width: '100%', height: '100%' }} contentFit="contain" /> : null}
      {busy ? <View className="absolute inset-0 items-center justify-center bg-black/60"><ActivityIndicator color="white" /></View> : null}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('editPost.coverUpload')} disabled={busy || disabled}
        onPress={() => void upload()} className="rounded-lg border border-white/20 bg-white/5 items-center justify-center"
        style={{ width: 80, height: 48, opacity: busy || disabled ? 0.5 : 1 }}>
        <Ionicons name="cloud-upload-outline" size={18} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>
      {frames.map(uri => <TouchableOpacity key={uri} accessibilityRole="button" disabled={busy || disabled}
        onPress={() => void save(uri)} className="rounded-lg overflow-hidden bg-black"
        style={{ width: 80, height: 48, opacity: busy || disabled ? 0.5 : 1 }}>
        <SmartImage source={{ uri }} recyclingKey={uri} style={{ width: '100%', height: '100%' }} contentFit="contain" />
      </TouchableOpacity>)}
      {loadingFrames ? <View className="items-center justify-center" style={{ width: 80, height: 48 }}><ActivityIndicator color="white" /></View> : null}
    </ScrollView>
  </View>;
}
