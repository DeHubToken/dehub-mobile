import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export type GifPickerProps = {
  visible: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
};

// Google retired the Tenor API in 2026 — every call now answers
// 403 "Tenor API is discontinued". GIPHY is what the web picker
// (dehubweb EmojiGifPicker) has used all along, with this same public beta
// key, so both apps now post URLs from one CDN and render each other's GIFs.
const GIPHY_API_KEY = 'GlVGYHkr3WSBnllca54iNt0yFbjz7L65';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';
const PAGE_SIZE = 30;

type GiphyGif = {
  id: string;
  title?: string;
  images?: {
    fixed_width?: { url?: string; width?: string; height?: string };
    fixed_width_small?: { url?: string };
    original?: { url?: string };
  };
};

/** The URL a picked GIF is posted with — `fixed_width` matches web. */
const getGifUrl = (item: GiphyGif): string | null =>
  item.images?.fixed_width?.url || item.images?.original?.url || null;

/** A lighter rendition for the grid tile; falls back to the posted URL. */
const getThumbUrl = (item: GiphyGif): string | null =>
  item.images?.fixed_width_small?.url || getGifUrl(item);

const useDebouncedCallback = (fn: (q: string) => void, delay = 400) => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(q), delay);
  }, [fn, delay]);
};

const GifPicker: React.FC<GifPickerProps> = ({ visible, onClose, onPick }) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<GiphyGif[]>([]);
  const [error, setError] = useState<string | null>(null);
  // A slow trending response must not overwrite the search that replaced it.
  const requestSeq = useRef(0);

  const fetchGifs = useCallback(async (q?: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const trimmed = q?.trim() ?? '';
      const url = trimmed.length > 0
        ? `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(trimmed)}&limit=${PAGE_SIZE}&rating=pg-13`
        : `${GIPHY_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=${PAGE_SIZE}&rating=pg-13`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`GIPHY ${res.status}`);
      const json = await res.json();
      if (seq !== requestSeq.current) return;
      const results: GiphyGif[] = Array.isArray(json?.data) ? json.data : [];
      setItems(results.filter((g) => !!getGifUrl(g)));
    } catch (e: any) {
      if (seq !== requestSeq.current) return;
      setError(t('dm.gifsLoadFailed'));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [t]);

  const debouncedSearch = useDebouncedCallback((q) => fetchGifs(q), 450);

  useEffect(() => {
    if (visible) {
      fetchGifs('');
    } else {
      requestSeq.current++;
      setQuery('');
      setItems([]);
      setError(null);
      setLoading(false);
    }
  }, [visible, fetchGifs]);

  const onChangeText = useCallback((text: string) => {
    setQuery(text);
    debouncedSearch(text);
  }, [debouncedSearch]);

  const renderItem = useCallback(({ item }: { item: GiphyGif }) => {
    const url = getGifUrl(item);
    const thumb = getThumbUrl(item);
    if (!url || !thumb) return null;
    const onPress = () => onPick(url);
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        className="w-1/3 p-1"
        accessibilityRole="button"
        accessibilityLabel={item.title || undefined}
      >
        <View className="w-full aspect-square rounded-md overflow-hidden bg-theme-neutrals-800 items-center justify-center">
          <Image
            source={{ uri: thumb }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
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
        <TouchableOpacity activeOpacity={1} onPress={onClose} className="flex-1 dark-surface bg-black/40" />
        <View
          className="bg-[#0C0C0E] rounded-t-[20px] border-t border-white/10 p-3 h-[70%]"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <View className="flex-row items-center mb-2">
            <TextInput
              placeholder={t('dm.searchGifs')}
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={onChangeText}
              autoCorrect={false}
              className="flex-1 h-11 px-3 rounded-lg bg-theme-neutrals-800 text-theme-neutrals-100"
            />
            <TouchableOpacity
              onPress={onPressClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              className="ml-2 w-10 h-10 rounded-xl bg-theme-neutrals-800 items-center justify-center active:opacity-80"
            >
              <Ionicons name="close" size={18} color="#E5E7EB" />
            </TouchableOpacity>
          </View>
          {loading ? (
            <View className="py-8 items-center justify-center">
              <ActivityIndicator size="small" color="#F4F4F5" />
            </View>
          ) : error ? (
            <Text className="text-white/80 px-2 py-4">{error}</Text>
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
          {/* GIPHY's attribution mark — a brand string, kept in English on web too. */}
          <Text className="text-[10px] text-theme-neutrals-500 text-center pt-2">Powered by GIPHY</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default GifPicker;
