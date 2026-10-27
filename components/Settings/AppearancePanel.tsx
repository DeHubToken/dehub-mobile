/**
 * Appearance panel — mirrors web's `AppearanceSettings`
 * (dehubweb src/pages/app/SettingsPage.tsx).
 *
 * Ported: Theme (a sample per theme, as web's picker), Theme Color, Language, Dim Lights (+ strength),
 * Auto-play, Data Saver. Web's seasonal themes and Light are not: Light was
 * tried and pulled (#673), and the seasonal ones are canvas art.
 * Not ported, deliberately:
 *  - Feed layout (comfortable/compact): web's is a desktop-sidebar collapse.
 *  - Shorts toggle: Home's pager addresses its six tabs by index
 *    (`TAB_ORDER` in screens/HomeScreen.tsx), so hiding one is a pager change,
 *    not a settings change.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import Slider from '@react-native-community/slider';
import LanguageSelectModal from './LanguageSelectModal';
import { SettingsAnchor, SettingsScrollView } from './SettingsAnchor';
import {
  SectionLabel,
  SettingsSection,
  SettingsLinkRow,
  SettingsToggleRow,
  SettingsOptionModal,
  Divider,
} from './SettingsPrimitives';
import {
  FEED_TAB_ORDER,
  feedDefaultsEvents,
  getDefaultFeedTab,
  hasFeedToggles,
  resetFeedToggles,
  setDefaultFeedTab,
  type AppFeedTab,
} from '../../libs/feed-defaults';
import ThemePicker from './ThemePicker';
import ThemeColorPicker from './ThemeColorPicker';
import { hasThemeColor } from '../../theme/themeColor';
import { useAppPrefs, setAppPref } from '../../hooks/useAppPrefs';
import { POST_LANDING_STYLES, isPostLandingStyle, type PostLandingStyle } from '../../libs/postLandingStyle';
import { useDataSaver, setDataSaverPref } from '../../hooks/useDataSaver';
import { useShortsEnabled } from '../../hooks/useShortsEnabled';
import { useHighQualityImages, setHighQualityImages } from '../../libs/cdnImage';
import {
  getCreatorPlaybackRateCount,
  clearCreatorPlaybackRates,
} from '../../libs/video-preferences';
import i18nInstance, { SUPPORTED_LANGUAGES } from '../../i18n';
import { useAppTheme } from '../../context/ThemeContext';
import { toastSuccess } from '../../libs/toast';

const AppearancePanel: React.FC = () => {
  const { t } = useTranslation();
  const prefs = useAppPrefs();
  const { colors } = useAppTheme();
  const { pref: dataSaverPref } = useDataSaver();
  const highQuality = useHighQualityImages();
  const { shortsEnabled, setShortsEnabled, saving: savingShorts } = useShortsEnabled();
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

  // Default feed + saved toggles (libs/feed-defaults), shared with web.
  const [defaultFeed, setDefaultFeed] = useState<AppFeedTab>(() => getDefaultFeedTab());
  const [feedModalVisible, setFeedModalVisible] = useState(false);
  const [landingModalVisible, setLandingModalVisible] = useState(false);
  const landingLabel = (style: PostLandingStyle) => ({
    ghost: t('settings.postLandingGhost', 'Ghost slot'),
    morph: t('settings.postLandingMorph', 'Morph'),
    pill: t('settings.postLandingPill', 'Pill to card'),
    drop: t('settings.postLandingDrop', 'Drop in'),
  })[style];
  const landingDescription = (style: PostLandingStyle) => ({
    ghost: t('settings.postLandingGhostDesc', 'Your feed makes room and your post fades into place'),
    morph: t('settings.postLandingMorphDesc', 'The composer shrinks into your post'),
    pill: t('settings.postLandingPillDesc', 'The upload bar opens out into your post once it is up'),
    drop: t('settings.postLandingDropDesc', 'Your post drops in from the top with a little bounce'),
  })[style];
  const [savedToggles, setSavedToggles] = useState(() => hasFeedToggles());
  useEffect(() => feedDefaultsEvents.subscribe(() => {
    setSavedToggles(hasFeedToggles());
    setDefaultFeed(getDefaultFeedTab());
  }), []);
  const feedLabel = (tab: AppFeedTab) => ({
    all: t('feed.home', 'Home'),
    short: t('feed.shorts', 'Shorts'),
    'feed-images': t('feed.images', 'Images'),
    video: t('feed.videos', 'Videos'),
    'feed-audio': t('feed.music', 'Music'),
    live: t('feed.live', 'Live'),
  })[tab];

  const languageName =
    SUPPORTED_LANGUAGES.find((l) => l.code === currentLang)?.nativeName ?? 'English';

  return (
    <SettingsScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Same key and values as web (`dehub.theme`), so each theme means the
          same thing on both. A sample per theme, as web draws it, rather than
          a list of names to guess from. */}
      <SettingsAnchor id="theme">
        <View className="mt-4">
          <SectionLabel label={t('settings.theme')} />
          <ThemePicker />
        </View>
      </SettingsAnchor>

      {/* Web's Theme Color, for the themes whose backdrop takes a colour. */}
      {hasThemeColor(prefs.theme) ? (
        <SettingsAnchor id="theme-color">
          <ThemeColorPicker theme={prefs.theme} />
        </SettingsAnchor>
      ) : null}

      <SettingsSection label={t('settings.appearance')} icon="Monitor" anchor="dim-lights">
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

      {/* Web's Layout rows: which feed a launch opens on, and a way back
          from the filter toggles that stay on as defaults. */}
      <SettingsSection label={t('settings.layout', 'Layout')} icon="LayoutGrid" anchor="default-feed">
        <SettingsLinkRow
          icon="House"
          label={t('settings.defaultFeed', 'Default feed')}
          description={t('settings.defaultFeedDesc', 'Choose which feed opens every time you open DeHub')}
          value={feedLabel(defaultFeed)}
          onPress={() => setFeedModalVisible(true)}
        />
        <Divider />
        <SettingsAnchor id="feed-toggles">
          <SettingsLinkRow
            icon="Filter"
            label={t('settings.feedToggles', 'Reset feed toggles')}
            description={t('settings.feedTogglesDesc', 'Filters you turn on in a feed stay on as your defaults until you reset them')}
            value={savedToggles ? t('settings.reset', 'Reset') : undefined}
            disabled={!savedToggles}
            onPress={() => {
              resetFeedToggles();
              toastSuccess(t('settings.feedTogglesCleared', 'Feed toggles reset'));
            }}
          />
        </SettingsAnchor>
        <Divider />
        {/* How a post you just sent lands at the top of Home (libs/postLanding). */}
        <SettingsAnchor id="post-landing">
          <SettingsLinkRow
            icon="WandSparkles"
            label={t('settings.postLanding', 'After you post')}
            description={t('settings.postLandingDesc', 'How your new post lands in your feed')}
            value={landingLabel(prefs.postLanding)}
            onPress={() => setLandingModalVisible(true)}
          />
        </SettingsAnchor>
      </SettingsSection>

      <SettingsSection label={t('settings.media')} icon="Play" anchor="media">
        <SettingsToggleRow
          icon="Play"
          label={t('settings.autoPlay')}
          description={t('settings.autoPlayDesc')}
          value={prefs.autoplay}
          onValueChange={(v) => setAppPref('autoplay', v)}
        />
        {prefs.autoplay && (
          <>
            <Divider />
            <SettingsToggleRow
              icon="VolumeX"
              label={t('settings.autoPlayMuted')}
              description={t('settings.autoPlayMutedDesc')}
              value={prefs.autoplayMuted}
              onValueChange={(v) => setAppPref('autoplayMuted', v)}
            />
          </>
        )}
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
        {/* Account-level and shared with web: off hides the Shorts tab and the
            Shorts carousels on Home. */}
        <SettingsAnchor id="shorts">
          <SettingsToggleRow
            icon="Shorts"
            label={t('settings.shortsEnabled', 'Shorts')}
            description={t('settings.shortsEnabledDesc', 'Show the Shorts feed tab and Shorts carousels on Home.')}
            value={shortsEnabled}
            onValueChange={(v) => void setShortsEnabled(v)}
            disabled={savingShorts}
          />
        </SettingsAnchor>
        <Divider />
        <SettingsToggleRow
          icon="Hand"
          label={t('settings.leftHanded')}
          description={t('settings.leftHandedDesc')}
          value={prefs.leftHanded}
          onValueChange={(v) => setAppPref('leftHanded', v)}
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

      <SettingsOptionModal
        visible={landingModalVisible}
        onClose={() => setLandingModalVisible(false)}
        title={t('settings.postLanding', 'After you post')}
        value={prefs.postLanding}
        options={POST_LANDING_STYLES.map((style) => ({
          value: style,
          label: landingLabel(style),
          description: landingDescription(style),
        }))}
        onSelect={(value) => {
          if (isPostLandingStyle(value)) setAppPref('postLanding', value);
        }}
        maxHeight="70%"
      />

      <SettingsOptionModal
        visible={feedModalVisible}
        onClose={() => setFeedModalVisible(false)}
        title={t('settings.defaultFeed', 'Default feed')}
        value={defaultFeed}
        options={FEED_TAB_ORDER.map((tab) => ({ value: tab, label: feedLabel(tab) }))}
        onSelect={(value) => {
          setDefaultFeed(value as AppFeedTab);
          setDefaultFeedTab(value as AppFeedTab);
        }}
        maxHeight="70%"
      />

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
