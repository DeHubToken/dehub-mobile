import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getThumbnailAsync } from 'expo-video-thumbnails';
import SmartImage from '../common/SmartImage';
import type { CreatorAsset } from '../../services/creator.service';

const thumbnails = new Map<string, string>();

/** One still per visible result; video players only mount when opened. */
export default function CreatorMediaPreview({ kind, url, posterUrl, width, height }: {
  kind: CreatorAsset['kind']; url?: string; posterUrl?: string; width: number; height: number;
}) {
  const initial = kind === 'image' ? url : posterUrl;
  const [uri, setUri] = useState(initial);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setUri(initial); setFailed(false); }, [initial, url]);
  useEffect(() => {
    if (kind !== 'video' || !url || posterUrl) return;
    let active = true;
    const cached = thumbnails.get(url);
    if (cached) { setUri(cached); setFailed(false); return; }
    void getThumbnailAsync(url, { time: 100, quality: 0.5 }).then((result) => {
      thumbnails.set(url, result.uri);
      if (thumbnails.size > 80) thumbnails.delete(thumbnails.keys().next().value!);
      if (active) { setUri(result.uri); setFailed(false); }
    }).catch(() => {});
    return () => { active = false; };
  }, [kind, url, posterUrl]);
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
      {uri && !failed
        ? <SmartImage source={{ uri }} recyclingKey={uri} style={{ width, height }} contentFit="cover" onError={() => setFailed(true)} />
        : <Ionicons name={kind === 'video' ? 'film-outline' : kind === 'audio' ? 'musical-notes-outline' : kind === 'model3d' ? 'cube-outline' : 'image-outline'} size={28} color="rgba(255,255,255,0.5)" />}
      {(kind === 'model3d' || kind === 'video') && <View style={{ position: 'absolute', right: 6, bottom: 6, padding: 5, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <Ionicons name={kind === 'model3d' ? 'cube-outline' : 'play'} size={14} color="white" />
      </View>}
    </View>
  );
}
