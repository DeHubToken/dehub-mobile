/**
 * Theme picker — a row of samples, one per theme, as web's Appearance tab
 * draws it (dehubweb src/components/app/settings/ThemePreviewCard.tsx).
 *
 * Each sample is the theme's real backdrop (a still of the live canvas,
 * assets/theme-previews/) with a miniature feed drawn over it in that theme's
 * own surfaces: nav pill, two post bentos, bottom bar. Colours are per theme,
 * never read from the active theme, so every sample shows its own theme and
 * not the current one. Keep the palette in step with web's THEME_SWATCHES.
 */
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../context/ThemeContext';
import { APP_THEMES, type AppThemeName } from '../../theme/colors';

type Swatch = {
  page: string;
  image?: number;
  bento: string;
  border: string;
  line: string;
  faint: string;
  accent: string;
  square?: boolean;
  /** Minimal: bentos dissolve into the canvas, hairlines separate. */
  flat?: boolean;
};

const GLASS = {
  bento: 'rgba(9,9,11,0.82)',
  border: 'rgba(255,255,255,0.12)',
  line: 'rgba(255,255,255,0.78)',
  faint: 'rgba(255,255,255,0.28)',
  accent: '#ffffff',
};

const SWATCHES: Record<AppThemeName, Swatch> = {
  system: { page: '#000000', bento: '#18181b', border: 'rgba(255,255,255,0.06)', line: 'rgba(255,255,255,0.8)', faint: 'rgba(255,255,255,0.22)', accent: '#ffffff' },
  minimal: { page: '#000000', bento: 'transparent', border: 'rgba(255,255,255,0.1)', line: 'rgba(255,255,255,0.8)', faint: 'rgba(255,255,255,0.22)', accent: '#ffffff', square: true, flat: true },
  cosmic: { page: '#040407', image: require('../../assets/theme-previews/cosmic.webp'), ...GLASS },
  hazy: { page: '#0a0714', image: require('../../assets/theme-previews/hazy.webp'), ...GLASS },
  swarms: { page: '#03080d', image: require('../../assets/theme-previews/swarms.webp'), ...GLASS },
  lavalamp: { page: '#120704', image: require('../../assets/theme-previews/lavalamp.webp'), ...GLASS },
  winter: { page: '#05070a', image: require('../../assets/theme-previews/winter.webp'), ...GLASS },
  war: { page: '#060a09', image: require('../../assets/theme-previews/war.webp'), bento: 'rgba(14,20,18,0.82)', border: 'rgba(79,227,224,0.4)', line: 'rgba(214,208,190,0.9)', faint: 'rgba(79,227,224,0.3)', accent: '#4fe3e0', square: true },
  osaka: { page: '#0a0812', image: require('../../assets/theme-previews/osaka.webp'), bento: 'rgba(17,14,28,0.8)', border: 'rgba(255,111,181,0.28)', line: 'rgba(236,233,245,0.9)', faint: 'rgba(176,170,196,0.35)', accent: '#ff6fb5' },
  jungle: { page: '#16110c', image: require('../../assets/theme-previews/jungle.webp'), bento: 'rgba(38,28,19,0.86)', border: 'rgba(226,176,96,0.28)', line: 'rgba(246,240,227,0.9)', faint: 'rgba(198,182,158,0.35)', accent: '#e2b060' },
};

/** The selection ring in the active theme's own language, as web's picker rules draw it. */
const RING: Partial<Record<AppThemeName, string>> = {
  war: '#4fe3e0',
  osaka: 'rgba(255,111,181,0.8)',
  jungle: 'rgba(140,190,90,0.8)',
};

const MockPost: React.FC<{ s: Swatch; media?: boolean }> = ({ s, media }) => {
  const r = s.square ? 0 : 6;
  const frame: ViewStyle = s.flat
    ? { borderBottomWidth: 1, borderColor: s.border, paddingVertical: 6, paddingHorizontal: 2 }
    : { backgroundColor: s.bento, borderWidth: 1, borderColor: s.border, borderRadius: r, padding: 6 };
  return (
    <View style={frame}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 10, height: 10, borderRadius: s.square ? 0 : 5, backgroundColor: s.faint, marginRight: 5 }} />
        <View style={{ flex: 1 }}>
          <View style={{ height: 3, width: '60%', borderRadius: 2, backgroundColor: s.line }} />
          <View style={{ height: 3, width: '38%', marginTop: 3, borderRadius: 2, backgroundColor: s.faint }} />
        </View>
      </View>
      {media ? (
        <View style={{ height: 30, marginTop: 6, borderRadius: s.square ? 0 : 4, backgroundColor: s.faint }} />
      ) : null}
    </View>
  );
};

const ThemeSample: React.FC<{
  value: AppThemeName;
  label: string;
  active: boolean;
  ring: string;
  onPress: () => void;
}> = ({ value, label, active, ring, onPress }) => {
  const s = SWATCHES[value];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={{ alignItems: 'center', width: 112 }}
    >
      <View
        style={{
          width: 112,
          height: 160,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: active ? ring : 'transparent',
          overflow: 'hidden',
          backgroundColor: s.page,
        }}
      >
        {s.image ? (
          <Image
            source={s.image}
            contentFit="cover"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : null}
        <View style={{ flex: 1, padding: 7, gap: 6 }} pointerEvents="none">
          <View
            style={{
              height: 12,
              borderRadius: s.square ? 0 : 6,
              backgroundColor: s.flat ? 'transparent' : s.bento,
              borderWidth: 1,
              borderColor: s.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-around',
              paddingHorizontal: 6,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={{ width: 4, height: 4, borderRadius: s.square ? 0 : 2, backgroundColor: i === 0 ? s.accent : s.faint }}
              />
            ))}
          </View>
          <MockPost s={s} media />
          <MockPost s={s} />
          <View style={{ flex: 1 }} />
          <View
            style={{
              height: 14,
              marginHorizontal: 10,
              borderRadius: s.square ? 0 : 7,
              backgroundColor: s.flat ? 'transparent' : s.bento,
              borderWidth: 1,
              borderColor: s.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{ width: 10, height: 6, borderRadius: s.square ? 0 : 2, backgroundColor: s.accent }} />
          </View>
        </View>
      </View>
      <Text
        numberOfLines={1}
        className={`mt-2 text-sm ${active ? 'text-white font-medium' : 'text-theme-neutrals-400'}`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const ThemePicker: React.FC = () => {
  const { t } = useTranslation();
  const { theme, setTheme } = useAppTheme();
  const ring = RING[theme] ?? '#ffffff';
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
    >
      {APP_THEMES.map((value) => (
        <ThemeSample
          key={value}
          value={value}
          label={t(`settings.${value}`)}
          active={theme === value}
          ring={ring}
          onPress={() => setTheme(value)}
        />
      ))}
    </ScrollView>
  );
};

export default ThemePicker;
