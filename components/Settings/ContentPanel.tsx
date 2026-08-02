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

const ContentPanel: React.FC<{ onOpenPrivacy: () => void; defaultPostVisibility: string }> = ({
  onOpenPrivacy,
  defaultPostVisibility,
}) => {
  const { t } = useTranslation();
  const prefs = useAppPrefs();

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
        <SettingsToggleRow
          icon="Funnel"
          label={t('settings.filterExplicit')}
          description={t('settings.filterExplicitDesc')}
          value={prefs.filterExplicit}
          onValueChange={(v) => setAppPref('filterExplicit', v)}
        />
        <Divider />
        <SettingsToggleRow
          icon="Eye"
          label={t('settings.showSensitive')}
          description={t('settings.showSensitiveDesc')}
          value={prefs.showSensitive}
          onValueChange={(v) => setAppPref('showSensitive', v)}
        />
        <Divider />
        <SettingsToggleRow
          icon="TriangleAlert"
          label={t('settings.enableContentWarnings')}
          description={t('settings.enableContentWarningsDesc')}
          value={prefs.contentWarnings}
          onValueChange={(v) => setAppPref('contentWarnings', v)}
        />
      </SettingsSection>

      <SettingsNote>{t('settings.contentFilteringNote')}</SettingsNote>
    </ScrollView>
  );
};

export default ContentPanel;
