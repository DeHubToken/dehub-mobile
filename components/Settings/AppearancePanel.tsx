/**
 * Appearance panel — mirrors web's `AppearanceSettings`
 * (dehubweb src/pages/app/SettingsPage.tsx).
 *
 * Ported: Theme, Language, Dim Lights (+ strength), Auto-play, Data Saver.
 * Not ported, deliberately:
 *  - Theme Color: light has no custom hue on web. Hue controls arrive with
 *    the first hue-driven theme instead of appearing as a dead control.
 *  - Feed layout (comfortable/compact): web's is a desktop-sidebar collapse.
 *  - Shorts toggle: Home's pager addresses its six tabs by index
 *    (`TAB_ORDER` in screens/HomeScreen.tsx), so hiding one is a pager change,
 *    not a settings change.
 */
import React, { useState } from 'react';
import { View, Text, Alert, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import Slider from '@react-native-community/slider';
import LanguageSelectModal from './LanguageSelectModal';
import { SettingsScrollView } from './SettingsAnchor';
import {
  SettingsSection,
  SettingsLinkRow,
  SettingsToggleRow,
  Divider,
} from './SettingsPrimitives';
import { useAppPrefs, setAppPref } from '../../hooks/useAppPrefs';
import { useDataSaver, setDataSaverPref } from '../../hooks/useDataSaver';
import { useHighQualityImages, setHighQualityImages } from '../../libs/cdnImage';
import {
  getCreatorPlaybackRateCount,
  clearCreatorPlaybackRates,
} from '../../libs/video-preferences';
import i18nInstance, { SUPPORTED_LANGUAGES } from '../../i18n';
import Icon from '../ui/Icon';
import { useAppTheme } from '../../context/ThemeContext';

const AppearancePanel: React.FC = () => {
  const { t } = useTranslation();
  const prefs = useAppPrefs();
  const { theme, colors, setTheme } = useAppTheme();
  const { pref: dataSaverPref } = useDataSaver();
  const highQuality = useHighQualityImages();
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [currentLang, setCurrentLang] = useState(i18nInstance.language);

  // Re-read on mount rather than subscribing: the players write this while the
  // settings screen is nowhere on the stack, so there is nothing to miss.
  const [channelSpeedCount, setChannelSpeedCount] = useState(() => getCreatorPlaybackRateCount());

  const resetChannelSpeeds = () => {
    if (channelSpeedCount === 0) return;
    Alert.alert(
      t('settings.channelSpeed', 'Playback Speed Per Channel'),
      t(
        'settings.channelSpeedResetConfirm',
        'Every channel goes back to your normal speed. Your normal speed is not changed.',
      ),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('settings.reset', 'Reset'),
          style: 'destructive',
          onPress: () => {
            clearCreatorPlaybackRates();
            setChannelSpeedCount(0);
          },
        },
      ],
    );
  };

  const languageName =
    SUPPORTED_LANGUAGES.find((l) => l.code === currentLang)?.nativeName ?? 'English';

  return (
    <SettingsScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
      <SettingsSection label={t('settings.theme')} icon="Palette" className="mt-4" anchor="theme">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}
        >
          {[
            { value: 'system' as const, icon: 'Monitor' as const, label: t('settings.system') },
            { value: 'light' as const, icon: 'Sun' as const, label: t('settings.light') },
          ].map((option) => {
            const selected = theme === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => setTheme(option.value)}
                activeOpacity={0.72}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                className={`min-w-[104px] items-center rounded-xl border-2 px-4 py-4 ${
                  selected
                    ? 'border-theme-neutrals-100 bg-theme-neutrals-800/50'
                    : 'border-transparent bg-theme-neutrals-800/50'
                }`}
              >
                <Icon name={option.icon} size={24} color={colors.neutrals[400]} />
                <Text className="mt-2 text-sm text-theme-neutrals-100">{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <Divider />
        <SettingsToggleRow
          icon="Lamp"
          label={t('settings.dimLights')}
          description={t('settings.dimLightsDesc')}
          value={prefs.dimLights}
          onValueChange={(v) => setAppPref('dimLights', v)}
        />
        {prefs.dimLights ? (
          <>
            <Divider />
            <View className="px-4 py-3 flex-row items-center">
              <Text className="text-theme-neutrals-500 text-sm mr-3">
                {t('settings.dimStrength')}
              </Text>
              <Slider
                style={{ flex: 1 }}
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={prefs.dimStrength}
                onValueChange={(v) => setAppPref('dimStrength', Math.round(v))}
                minimumTrackTintColor={colors.foreground}
                maximumTrackTintColor={colors.border}
                thumbTintColor={colors.foreground}
              />
              <Text className="text-theme-neutrals-400 text-sm w-10 text-right">
                {prefs.dimStrength}%
              </Text>
            </View>
          </>
        ) : null}
      </SettingsSection>

      <SettingsSection label={t('settings.language')} icon="Globe" anchor="language">
        <SettingsLinkRow
          icon="Globe"
          label={t('settings.language')}
          description={t('settings.languageDesc')}
          value={languageName}
          onPress={() => {
            setCurrentLang(i18nInstance.language);
            setLanguageModalVisible(true);
          }}
        />
      </SettingsSection>

      <SettingsSection label={t('settings.media')} icon="Play" anchor="media">
        <SettingsToggleRow
          icon="Play"
          label={t('settings.autoPlay')}
          description={t('settings.autoPlayDesc')}
          value={prefs.autoplay}
          onValueChange={(v) => setAppPref('autoplay', v)}
        />
        <Divider />
        <SettingsToggleRow
          icon="Gauge"
          label={t('settings.dataSaver')}
          description={t('settings.dataSaverDesc')}
          value={dataSaverPref === 'on'}
          onValueChange={(v) => setDataSaverPref(v ? 'on' : 'auto')}
        />
        <Divider />
        {/* Feed thumbnails, grid tiles and avatars are normally fetched at the
            size they render at. Fullscreen and zoomable views always use the
            original regardless of this switch — this is for anyone who would
            rather spend the bytes than accept a resize anywhere at all. */}
        <SettingsToggleRow
          icon="Image"
          label={t('settings.highQualityImages')}
          description={t('settings.highQualityImagesDesc')}
          value={highQuality}
          onValueChange={setHighQualityImages}
        />
        <Divider />
        {/* Changing speed on a video pins that speed to its creator (see
            libs/video-preferences.ts), which is what makes 1.5× on one channel
            and 1× on another stick. That is invisible once set, so the count
            and a way back live here. */}
        <SettingsLinkRow
          icon="Gauge"
          label={t('settings.channelSpeed', 'Playback Speed Per Channel')}
          description={
            channelSpeedCount === 0
              ? t(
                  'settings.channelSpeedNone',
                  'Change the speed while watching someone and it stays that way for their videos.',
                )
              : t('settings.channelSpeedCount', {
                  defaultValue: '{{count}} channel(s) play at their own speed.',
                  count: channelSpeedCount,
                })
          }
          value={channelSpeedCount === 0 ? undefined : t('settings.reset', 'Reset')}
          disabled={channelSpeedCount === 0}
          onPress={resetChannelSpeeds}
        />
      </SettingsSection>

      <LanguageSelectModal
        visible={languageModalVisible}
        onClose={() => {
          setLanguageModalVisible(false);
          setCurrentLang(i18nInstance.language);
        }}
      />
    </SettingsScrollView>
  );
};

export default AppearancePanel;
