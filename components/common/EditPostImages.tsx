import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getNFT, replacePostImage, addPostImages, getPostImageAllowance } from '../../services/nft.service';
import { ensureMediaLibraryPermission } from '../../libs/permissions.util';
import { buildFeedImageUrls, toastError, toastSuccess } from '../../libs';
import { MAX_IMAGE_UPLOAD_BYTES, MAX_REQUEST_IMAGE_BYTES } from '../../libs/post-image-allowance';

export default function EditPostImages({ tokenId, disabled, onBusyChange }: {
  tokenId: number | string; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const [images, setImages] = useState<string[]>([]);
  const [imageLimit, setImageLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setImageLimit(null);
    getPostImageAllowance(tokenId).then(({ imageLimit }) => {
      if (active) setImageLimit(imageLimit);
    }).catch(() => { /* Replacement remains available if allowance cannot load. */ });
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
      if ((image.fileSize ?? 0) > MAX_IMAGE_UPLOAD_BYTES) { toastError('Image must be 42.069 MB or smaller'); return; }
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

  const add = async () => {
    if (disabled || busyIndex !== null || imageLimit === null || images.length >= imageLimit) return;
    setBusyIndex(-1);
    onBusyChange(true);
    try {
      const permission = await ensureMediaLibraryPermission();
      if (!permission.granted) { toastError('Media library permission is required'); return; }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1,
        allowsMultipleSelection: true, selectionLimit: imageLimit - images.length,
      });
      if (picked.canceled || !picked.assets?.length) return;
      if (images.length + picked.assets.length > imageLimit) { toastError(`Your badge tier allows up to ${imageLimit} images per post`); return; }
      if (picked.assets.some(image => (image.fileSize ?? 0) > MAX_IMAGE_UPLOAD_BYTES)) { toastError('Images must be 42.069 MB or smaller'); return; }
      const totalBytes = (await Promise.all(picked.assets.map(async image => {
        if (image.fileSize != null) return image.fileSize;
        const info = await FileSystem.getInfoAsync(image.uri).catch(() => null);
        return (info as any)?.size ?? 0;
      }))).reduce((total, size) => total + size, 0);
      if (totalBytes > MAX_REQUEST_IMAGE_BYTES) { toastError('Images in one upload must total 100 MB or less'); return; }
      const updated = await addPostImages(tokenId, picked.assets.map(image => ({
        uri: image.uri, name: image.fileName || 'image.jpg', type: image.mimeType || 'image/jpeg',
      })));
      setImages(updated);
      DeviceEventEmitter.emit('post-images-replaced', { tokenId: String(tokenId), imageUrls: updated });
      toastSuccess('Images added');
    } catch (error: any) {
      toastError(error?.message || 'Could not add those images');
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
    <Text className="text-zinc-400 text-xs mb-3">Adding or replacing images saves immediately. Your post keeps its link, views and comments.</Text>
    {imageLimit === null ? <TouchableOpacity disabled={disabled || busyIndex !== null} onPress={() => setAttempt(value => value + 1)}><Text className="text-zinc-400 text-xs mb-3">Image allowance unavailable. Retry</Text></TouchableOpacity> :
      <Text className="text-zinc-400 text-xs mb-3">{images.length} / {imageLimit} images · Based on your badge tier</Text>}
    <TouchableOpacity accessibilityRole="button" disabled={disabled || busyIndex !== null || imageLimit === null || images.length >= imageLimit}
      onPress={() => void add()} className="rounded-xl border border-white/10 bg-white/5 p-3 mb-3"
      style={{ opacity: disabled || busyIndex !== null || imageLimit === null || images.length >= imageLimit ? 0.5 : 1 }}>
      <Text className="text-white text-sm text-center">{busyIndex === -1 ? 'Adding images…' : imageLimit !== null && images.length >= imageLimit ? 'Badge image limit reached' : 'Add images'}</Text>
    </TouchableOpacity>
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
