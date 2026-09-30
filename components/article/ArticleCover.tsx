import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import SmartImage from '../common/SmartImage';
import Icon from '../ui/Icon';
import type { ArticleLook } from '../../libs/article';

interface ArticleCoverProps {
  look: ArticleLook;
  label: string;
  title?: string;
  coverUri?: string;
  /** Date and reading time, shown on the reader's hero. */
  meta?: string;
  /** Reader hero is taller and its title larger. */
  hero?: boolean;
}

/**
 * The cover with the title on it, as web draws it: dark scrim over the photo
 * so the title stays white on every theme. Without a cover it becomes a
 * headline panel in the theme's colours.
 */
export default function ArticleCover({ look, label, title, coverUri, meta, hero }: ArticleCoverProps) {
  const titleStyle = [
    s.title,
    { fontFamily: look.font, fontSize: hero ? 27 : 21, lineHeight: hero ? 32 : 26 },
    look.mono && s.mono,
  ];
  if (!coverUri) {
    return (
      <View style={[s.panel, { borderRadius: look.radius, borderColor: look.line, backgroundColor: look.wash }]}>
        <Icon name="BookOpen" size={30} color={look.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[s.label, { color: look.accent }]}>{label}</Text>
          {!!title && <Text style={[titleStyle, { color: look.ink, marginTop: 6 }]}>{title}</Text>}
          {!!meta && <Text style={[s.meta, { color: look.ink3 }]}>{meta}</Text>}
        </View>
      </View>
    );
  }
  return (
    <View style={[s.cover, { borderRadius: look.radius, aspectRatio: hero ? 4 / 3 : 16 / 10 }]}>
      <SmartImage source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={coverUri} />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.85)']}
        locations={[0.3, 0.62, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={s.coverText}>
        <Text style={[s.label, { color: look.accent }]}>{label}</Text>
        {!!title && <Text style={[titleStyle, { color: '#fff', marginTop: 6 }, s.shadow]}>{title}</Text>}
        {!!meta && <Text style={[s.meta, { color: 'rgba(255,255,255,0.78)' }]}>{meta}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  cover: { width: '100%', overflow: 'hidden', backgroundColor: '#111' },
  coverText: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  panel: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16, borderWidth: 1 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { fontWeight: '700' },
  mono: { textTransform: 'uppercase', letterSpacing: 0.5 },
  meta: { fontSize: 13, marginTop: 6 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 1 } },
});
