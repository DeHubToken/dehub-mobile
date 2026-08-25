/**
 * Content panel — mirrors web's `ContentSettings`
 * (dehubweb src/pages/app/SettingsPage.tsx).
 *
 * Web ships this whole tab as `comingSoon` switches with no persistence except
 * the default-post-visibility select, which lives on the Privacy tab there and
 * is already implemented in `PrivacySettingsScreen` here. To avoid two
 * controls writing the same field, this panel shows the visibility as a
 * read-only summary pointing at Privacy, and keeps the filters device-local so
 * the toggles at least remember themselves.
 */
import React from 'react';
import { ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  SettingsSection,
  SettingsToggleRow,
  SettingsLinkRow,
  SettingsNote,
  Divider,
} from './SettingsPrimitives';
import { useAppPrefs, setAppPref } from '../../hooks/useAppPrefs';
import { useMatureContent } from '../../hooks/useMatureContent';

const ContentPanel: React.FC<{ onOpenPrivacy: () => void; defaultPostVisibility: string }> = ({
  onOpenPrivacy,
  defaultPostVisibility,
}) => {
  const { t } = useTranslation();
  const prefs = useAppPrefs();
  const { showMatureContent, setShowMatureContent, saving: savingMature } = useMatureContent();

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
      <SettingsSection label={t('settings.postSettings')} icon="FileText" className="mt-4">
        <SettingsLinkRow
          icon="Globe"
          label={t('settings.defaultPostVisibility')}
          description={t('settings.whoCanSeeDefault')}
          value={
            defaultPostVisibility === 'private' ? t('settings.private') : t('settings.public')
          }
          onPress={onOpenPrivacy}
        />
        <Divider />
        <SettingsToggleRow
          icon="Save"
          label={t('settings.autoSaveDrafts')}
          description={t('settings.autoSaveDraftsDesc')}
          value={prefs.autoSaveDrafts}
          onValueChange={(v) => setAppPref('autoSaveDrafts', v)}
        />
      </SettingsSection>

      <SettingsSection label={t('settings.contentFiltering')} icon="Funnel">
        {/* One real switch replaces three device-local ones that filtered
            nothing. "Filter explicit content" and "Content warnings" were this
            same setting worded twice, and are what this one does when it is
            off. Account-level, so it follows the reader onto web. */}
        <SettingsToggleRow
          icon="EyeOff"
          label={t('settings.matureContent', 'Show Mature Content')}
          description={t(
            'settings.matureContentDesc',
            'Include adult and graphic posts in your feeds, and drop the warning on ones you already see. Off by default.',
          )}
          value={showMatureContent}
          onValueChange={setShowMatureContent}
          disabled={savingMature}
        />
        <Divider />
        {/* Device-local, and deliberately off by default: a feed that quietly
            drops what you have already seen is the wrong surprise to hand
            someone who never asked for it. Only videos and shorts are ever
            hidden — hooks/useWatchedVideos explains why a watch record on an
            image means something else entirely. */}
        <SettingsToggleRow
          icon="EyeOff"
          label={t('settings.hideWatched', 'Hide Watched Videos')}
          description={t(
            'settings.hideWatchedDesc',
            'Keep videos you have already played out of your feeds. Off by default.',
          )}
          value={prefs.hideWatched}
          onValueChange={(v) => setAppPref('hideWatched', v)}
        />
        <Divider />
        {/* Off by default, and deliberately so: skipping a sponsor read is a
            decision about someone else's income, so it is one the viewer makes
            rather than one they find has been made for them. Every skip offers
            an undo for the four seconds the toast is up. */}
        <SettingsToggleRow
          icon="FastForward"
          label={t('settings.skipSegments', 'Skip Sponsors And Intros')}
          description={t(
            'settings.skipSegmentsDesc',
            'Jump past sections other viewers have marked as sponsor reads, intros or outros. Every skip can be undone. Off by default.',
          )}
          value={prefs.skipSegments}
          onValueChange={(v) => setAppPref('skipSegments', v)}
        />
      </SettingsSection>

      <SettingsNote>{t('settings.contentFilteringNote')}</SettingsNote>
    </ScrollView>
  );
};

export default ContentPanel;
