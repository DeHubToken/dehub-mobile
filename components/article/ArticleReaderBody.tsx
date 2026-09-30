import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import MarkdownText from '../ui/MarkdownText';
import Icon from '../ui/Icon';
import type { ArticleLook } from '../../libs/article';

type Size = 's' | 'm' | 'l';
const SIZES: Record<Size, number> = { s: 15, m: 17, l: 20 };
const NEXT: Record<Size, Size> = { s: 'm', m: 'l', l: 's' };
const SIZE_KEY = 'dehub.article.size';
// Remembered for the session so the next article opens at the same size
// without waiting on storage.
let remembered: Size | null = null;

/** An article's body set for reading, with a text-size switch that sticks. */
export default function ArticleReaderBody({ body, look }: { body: string; look: ArticleLook }) {
  const { t } = useTranslation();
  const [size, setSize] = useState<Size>(remembered ?? 'm');
  useEffect(() => {
    if (remembered) return;
    AsyncStorage.getItem(SIZE_KEY).then(v => {
      if (v === 's' || v === 'm' || v === 'l') { remembered = v; setSize(v); }
    }).catch(() => { /* default size */ });
  }, []);
  const base = look.mono ? SIZES[size] - 2 : SIZES[size];
  return (
    <View>
      <View style={s.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('articles.textSize')}
          onPress={() => { const next = NEXT[size]; remembered = next; setSize(next); AsyncStorage.setItem(SIZE_KEY, next).catch(() => { /* session only */ }); }}
          style={[s.chip, { borderColor: look.line, borderRadius: look.radius ? 999 : 0 }]}
          hitSlop={8}
        >
          <Icon name="Type" size={15} color={look.ink2} />
          <Text style={[s.chipText, { color: look.ink2 }]}>{size === 'm' ? 'A' : size === 's' ? 'A−' : 'A+'}</Text>
        </Pressable>
      </View>
      <MarkdownText
        content={body}
        color={look.ink2}
        accent={look.accent}
        style={{ fontSize: base, lineHeight: Math.round(base * 1.65), fontFamily: look.font }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 11, fontWeight: '700' },
});
