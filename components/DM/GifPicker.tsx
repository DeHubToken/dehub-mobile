import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import env from '../../config/env';

export type GifPickerProps = {
  visible: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
};

type TenorResult = {
  id: string;
  title?: string;
  media_formats?: Record<string, { url: string }>;
  media?: Array<Record<string, { url: string }>>; // legacy v1 compat
};

const CLIENT_KEY = 'dehub-mobile';

const getGifUrl = (item: TenorResult): string | null => {
  // Prefer v2 media_formats first
  const fm = item.media_formats || {};
  const preferred = ['tinygif', 'gif', 'nanogif', 'mp4'];
  for (const key of preferred) {
    const u = fm[key]?.url;
    if (u) return u;
  }
  // v1 fallback structure
  if (Array.isArray(item.media) && item.media.length > 0) {
    const cand = item.media[0];
    for (const k of Object.keys(cand)) {
      const u = (cand as any)[k]?.url;
      if (u) return u;
    }
  }
  return null;
};

const useDebouncedCallback = (fn: (q: string) => void, delay = 400) => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(q), delay);
  }, [fn, delay]);
};

const GifPicker: React.FC<GifPickerProps> = ({ visible, onClose, onPick }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TenorResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const key = env.TENOR_API_KEY;

  const fetchTenor = useCallback(async (q?: string) => {
    if (!key) {
      setError('Missing TENOR_API_KEY');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const base = 'https://tenor.googleapis.com/v2';
      const url = q && q.trim().length > 0
        ? `${base}/search?q=${encodeURIComponent(q)}&key=${key}&client_key=${CLIENT_KEY}&limit=30&media_filter=gif` 
        : `${base}/featured?key=${key}&client_key=${CLIENT_KEY}&limit=30&media_filter=gif`;
      const res = await fetch(url);
      const json = await res.json();
      const results: TenorResult[] = json?.results || [];
      setItems(results);
    } catch (e: any) {
      setError(e?.message || 'Failed to load GIFs');
    } finally {
      setLoading(false);
    }
  }, [key]);

  const debouncedSearch = useDebouncedCallback((q) => fetchTenor(q), 450);

  useEffect(() => {
    if (visible) {
      fetchTenor('');
    } else {
      setQuery('');
      setItems([]);
      setError(null);
    }
  }, [visible, fetchTenor]);

  const onChangeText = useCallback((t: string) => {
    setQuery(t);
    debouncedSearch(t);
  }, [debouncedSearch]);

  const renderItem = useCallback(({ item }: { item: TenorResult }) => {
    const url = getGifUrl(item);
    if (!url) return null;
    const onPress = () => onPick(url);
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} className="w-1/3 p-1">
        <View className="w-full aspect-square rounded-md overflow-hidden bg-theme-neutrals-800 items-center justify-center">
          <Image
            source={{ uri: url }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            onLoadStart={() => {}}
          />
        </View>
      </TouchableOpacity>
    );
  }, [onPick]);

  const onPressClose = useCallback(() => onClose(), [onClose]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      {/* Edge-to-edge Android doesn't resize for the keyboard — lift the sheet. */}
      <KeyboardAvoidingView behavior="padding" className="flex-1 justify-end">
        <TouchableOpacity activeOpacity={1} onPress={onClose} className="flex-1 bg-black/40" />
        <View className="bg-theme-neutrals-900 rounded-t-2xl p-3 h-[70%]">
          <View className="flex-row items-center mb-2">
            <TextInput
              placeholder="Search GIFs"
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={onChangeText}
              className="flex-1 h-11 px-3 rounded-lg bg-theme-neutrals-800 text-theme-neutrals-100"
            />
            <TouchableOpacity
              onPress={onPressClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="ml-2 w-10 h-10 rounded-full bg-theme-neutrals-800 items-center justify-center active:opacity-80"
            >
              <Ionicons name="close" size={18} color="#E5E7EB" />
            </TouchableOpacity>
          </View>
          {loading ? (
            <View className="py-8 items-center justify-center">
              <ActivityIndicator size="small" />
            </View>
          ) : error ? (
            <Text className="text-red-400 px-2 py-4">{error}</Text>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(it) => it.id}
              numColumns={3}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default GifPicker;
