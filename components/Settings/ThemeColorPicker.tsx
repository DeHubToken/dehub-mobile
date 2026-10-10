import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
/**
 * Theme Color — web's picker for the customisable canvas themes (Cosmic, Hazy,
 * Swarms, Lava Lamp), ported from dehubweb src/pages/app/SettingsPage.tsx
 * `ThemeColorPicker`: White, Black, Rainbow and Brand presets, a hue slider
 * and a hex field. The pick re-colours the live backdrop and the glass tint
 * of the pills and cards (theme/themeColor.ts) as it changes.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';
import { useAppTheme } from '../../context/ThemeContext';
import { useUser } from '../../context/AuthContext';
import { getAvatarUrl } from '../../libs/misc';
import { CAN_EXTRACT_BRAND_COLORS, extractBrandColors } from '../../libs/brandColors';
import { toastError } from '../../libs/toast';
import { DEFAULT_THEME_HUES, THEME_COLOR, hexToHue, hueToHex } from '../../theme/themeColor';

const RAINBOW = ['#ff0000', '#ff9900', '#33cc33', '#0099ff', '#cc33ff'];
const METAL = ['#8a9099', '#dfe4ea', '#ffffff', '#aeb6c2', '#6b7280', '#c4ccd6', '#8a9099'];

const Dot: React.FC<{ colors?: string[]; fill?: string; size?: number; radius?: number; children?: React.ReactNode }> = ({
  colors,
  fill,
  size = 20,
  radius,
  children,
}) => {
  const style: ViewStyle = {
    width: size,
    height: size,
    borderRadius: radius ?? size / 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: fill,
  };
  if (!colors) return <View style={style}>{children}</View>;
  const stops = colors.length === 1 ? [colors[0], colors[0]] : colors;
  return (
    <LinearGradient colors={stops as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style}>
      {children}
    </LinearGradient>
  );
};

const ThemeColorPicker: React.FC<{ theme: string }> = ({ theme }) => {
  const { t } = useTranslation();
  const { themeHues, setThemeHue, brandColors, setBrandColors } = useAppTheme();
  const user = useUser();
  const defaultValue = DEFAULT_THEME_HUES[theme] ?? 260;
  const value = themeHues[theme] ?? defaultValue;
  const special = value < 0;
  const sliderHue = special ? (defaultValue < 0 ? 260 : defaultValue) : value;
  const [hexDraft, setHexDraft] = useSurfaceDraft<string | null>("components/Settings/ThemeColorPicker.tsx:hexDraft", null, theme);
  const [brandLoading, setBrandLoading] = useState(false);
  const hexValue = hexDraft ?? (special ? '' : hueToHex(value));

  const labels: Record<number, string> = {
    [THEME_COLOR.WHITE]: t('settings.themeColorWhite'),
    [THEME_COLOR.BLACK]: t('settings.themeColorBlack'),
    [THEME_COLOR.RAINBOW]: t('settings.themeColorRainbow'),
    [THEME_COLOR.BRAND]: t('settings.themeColorBrand'),
  };

  const brandSwatch = brandColors.length > 0 ? brandColors : METAL;
  const preview =
    value === THEME_COLOR.WHITE ? <Dot fill="#ffffff" size={36} radius={8} />
      : value === THEME_COLOR.BLACK ? <Dot fill="#000000" size={36} radius={8} />
        : value === THEME_COLOR.RAINBOW ? <Dot colors={RAINBOW} size={36} radius={8} />
          : value === THEME_COLOR.BRAND ? <Dot colors={brandSwatch} size={36} radius={8} />
            : <Dot fill={hueToHex(value)} size={36} radius={8} />;

  // Re-read the picture on every tap, as web does, so the palette never lags
  // a new profile picture or an account switch.
  const onBrand = async () => {
    const url = user?.avatarImageUrl ? getAvatarUrl(user.avatarImageUrl, 0) : null;
    if (!url || url === 'default-avatar') {
      toastError(t('settings.themeColorBrandNoAvatar', 'Add a profile picture to use Brand colors'));
      return;
    }
    const alreadyActive = value === THEME_COLOR.BRAND && brandColors.length > 0;
    setBrandLoading(true);
    try {
      const colors = await extractBrandColors(url, 3);
      if (colors.length > 0) {
        setBrandColors(colors);
        setThemeHue(theme, THEME_COLOR.BRAND);
        setHexDraft.complete(hexDraft, null);
      } else if (!alreadyActive) {
        toastError(t('settings.themeColorBrandFailed', "Couldn't read colors from your profile picture"));
      }
    } catch {
      if (!alreadyActive) toastError(t('settings.themeColorBrandFailed', "Couldn't read colors from your profile picture"));
    } finally {
      setBrandLoading(false);
    }
  };

  const presets: { mode: number; dot: React.ReactNode }[] = [
    { mode: THEME_COLOR.WHITE, dot: <Dot fill="#ffffff" /> },
    { mode: THEME_COLOR.BLACK, dot: <Dot fill="#000000" /> },
    { mode: THEME_COLOR.RAINBOW, dot: <Dot colors={RAINBOW} /> },
  ];

  const chip = (active: boolean): ViewStyle => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: active ? '#ffffff' : 'rgba(255,255,255,0.18)',
    backgroundColor: active ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.3)',
  });

  return (
    <View style={{ marginTop: 16, marginHorizontal: 16, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(0,0,0,0.25)', gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ marginRight: 12, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="Palette" size={20} color="#A1A1AA" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '500' }}>{t('settings.themeColor', 'Theme Color')}</Text>
          <Text style={{ color: '#8B8D90', fontSize: 14, marginTop: 2 }}>
            {t('settings.themeColorDesc', 'Pick a custom color for this theme')}
          </Text>
        </View>
        {value !== defaultValue ? (
          <Pressable
            onPress={() => {
              setThemeHue(theme, null);
              setHexDraft.complete(hexDraft, null);
            }}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={{ color: '#A6A9AC', fontSize: 14 }}>{t('settings.themeColorReset', 'Reset')}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {presets.map((p) => (
          <Pressable
            key={p.mode}
            onPress={() => {
              setThemeHue(theme, p.mode);
              setHexDraft.complete(hexDraft, null);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: value === p.mode }}
            style={chip(value === p.mode)}
          >
            {p.dot}
            <Text style={{ color: '#ffffff', fontSize: 14 }}>{labels[p.mode]}</Text>
          </Pressable>
        ))}
        {CAN_EXTRACT_BRAND_COLORS ? <Pressable
          onPress={onBrand}
          disabled={brandLoading}
          accessibilityRole="button"
          accessibilityHint={t('settings.themeColorBrandDesc', 'Use your profile picture colors')}
          accessibilityState={{ selected: value === THEME_COLOR.BRAND, busy: brandLoading }}
          style={[chip(value === THEME_COLOR.BRAND), brandLoading ? { opacity: 0.7 } : null]}
        >
          <Dot colors={brandSwatch}>{brandLoading ? <ActivityIndicator size="small" color="#fff" style={{ transform: [{ scale: 0.6 }] }} /> : null}</Dot>
          <Text style={{ color: '#ffffff', fontSize: 14 }}>{labels[THEME_COLOR.BRAND]}</Text>
        </Pressable> : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {preview}
        <Slider
          style={{ flex: 1 }}
          minimumValue={0}
          maximumValue={359}
          step={1}
          value={sliderHue}
          onValueChange={(v) => {
            setThemeHue(theme, Math.round(v));
            setHexDraft.complete(hexDraft, null);
          }}
          minimumTrackTintColor={special ? '#ffffff' : hueToHex(sliderHue)}
          maximumTrackTintColor="rgba(255,255,255,0.2)"
          thumbTintColor="#ffffff"
          accessibilityLabel={t('settings.themeColor', 'Theme Color')}
        />
        <TextInput
          value={hexValue}
          maxLength={7}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={special ? labels[value] : undefined}
          placeholderTextColor="#71717A"
          accessibilityLabel={t('settings.themeColor')}
          onChangeText={(next) => {
            setHexDraft(next);
            const parsed = hexToHue(next);
            if (parsed !== null) setThemeHue(theme, parsed);
          }}
          onBlur={() => setHexDraft.complete(hexDraft, null)}
          style={{
            width: 88,
            height: 36,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.18)',
            backgroundColor: 'rgba(0,0,0,0.4)',
            color: '#ffffff',
            textAlign: 'center',
            fontFamily: 'monospace',
            fontSize: 14,
          }}
        />
      </View>
    </View>
  );
};

export default ThemeColorPicker;
