import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getNFT, replacePostImage } from '../../services/nft.service';
import { ensureMediaLibraryPermission } from '../../libs/permissions.util';
import { buildFeedImageUrls, toastError, toastSuccess } from '../../libs';

export default function EditPostImages({ tokenId, disabled, onBusyChange }: {
  tokenId: number | string; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    getNFT(tokenId).then(({ result }) => {
      if (active) setImages(result.postType === 'feed-images' && Array.isArray(result.imageUrls) ? result.imageUrls : []);
    }).catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tokenId, attempt]);

  const replace = async (index: number) => {
    if (disabled || busyIndex !== null) return;
    setBusyIndex(index);
    onBusyChange(true);
    try {
      const permission = await ensureMediaLibraryPermission();
      if (!permission.granted) { toastError('Media library permission is required'); return; }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
      if (picked.canceled || !picked.assets?.[0]) return;
      const image = picked.assets[0];
      if ((image.fileSize ?? 0) > 20 * 1024 * 1024) { toastError('Image must be 20 MB or smaller'); return; }
      const updated = await replacePostImage(tokenId, index, {
        uri: image.uri, name: image.fileName || 'replacement.jpg', type: image.mimeType || 'image/jpeg',
      });
      setImages(updated);
      DeviceEventEmitter.emit('post-images-replaced', { tokenId: String(tokenId), imageUrls: updated });
      toastSuccess('Image replaced');
    } catch (error: any) {
      toastError(error?.message || 'Could not replace that image');
    } finally {
      setBusyIndex(null);
      onBusyChange(false);
    }
  };

  if (loading) return <Text className="text-zinc-400 text-sm mb-4">Loading post images…</Text>;
  if (failed) return <TouchableOpacity onPress={() => setAttempt(value => value + 1)}><Text className="text-zinc-300 mb-4">Could not load post images. Retry</Text></TouchableOpacity>;
  if (!images.length) return null;
  const previews = buildFeedImageUrls(images, 320);
  return <View className="mb-4">
    <Text className="text-zinc-300 text-sm mb-2">Images</Text>
    <Text className="text-zinc-400 text-xs mb-3">Choosing a replacement saves that image immediately. Your post keeps its link, views and comments.</Text>
    <View className="flex-row flex-wrap gap-3">
      {previews.map((uri, index) => <TouchableOpacity key={index} disabled={disabled || busyIndex !== null}
        accessibilityRole="button" accessibilityLabel={`Replace image ${index + 1}`}
        onPress={() => void replace(index)} style={{ width: '46%', opacity: disabled || busyIndex !== null ? 0.5 : 1 }}
        className="rounded-xl border border-white/10 overflow-hidden bg-white/5">
        <Image source={{ uri }} style={{ width: '100%', height: 112 }} resizeMode="contain" />
        {busyIndex === index ? <ActivityIndicator color="white" style={{ margin: 10 }} /> : <Text className="text-white text-sm text-center p-2">Replace image {index + 1}</Text>}
      </TouchableOpacity>)}
    </View>
  </View>;
}
