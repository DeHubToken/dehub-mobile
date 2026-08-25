/**
 * Data Portability — Settings → Privacy → Your data
 *
 * Export replaced a "coming soon" row that had been sitting here; import is
 * what makes the export worth having. Moving to another account means
 * following the same people again, and a list you cannot act on is not
 * portable data.
 *
 * The import is deliberately two steps. Applying it follows accounts, restores
 * blocks and creates folders as you — side effects on a live account — so the
 * file is read and counted first, and the confirm says exactly what will
 * happen before anything is written.
 *
 * The file format is web's, so an export from either client imports on the
 * other; see libs/data-portability for the two sections the phone carries but
 * never applies.
 */

import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SettingsSection, SettingsLinkRow, Divider } from './SettingsPrimitives';
import { useUser } from '../../context/AuthContext';
import { toastError, toastSuccess } from '../../libs';
import { saveJsonFile, readJsonFile } from '../../libs/json-file';
import {
  applyImport,
  buildExport,
  exportFileName,
  parseExport,
  planImport,
  type ImportPlan,
} from '../../libs/data-portability';

const DataPortabilitySection: React.FC = () => {
  const { t } = useTranslation();
  const user = useUser();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const address = (user as any)?.address || (user as any)?.walletAddress || '';

  const handleExport = async () => {
    if (!address || exporting) return;
    setExporting(true);
    try {
      const data = await buildExport({
        address,
        username: (user as any)?.username,
        displayName: (user as any)?.displayName,
      });
      const saved = await saveJsonFile(exportFileName(data), JSON.stringify(data, null, 2));
      if (saved) {
        toastSuccess(
          t('settings.exportReady', {
            defaultValue: '{{count}} accounts, {{saved}} saved posts exported.',
            count: data.following.length,
            saved: data.savedPosts.length,
          }),
        );
      }
    } catch (e: any) {
      toastError(e?.message || t('settings.exportFailed', 'Could not build that export.'));
    } finally {
      setExporting(false);
    }
  };

  const runImport = async (plan: ImportPlan) => {
    setImporting(true);
    setProgress({ done: 0, total: 1 });
    try {
      const result = await applyImport(plan, address, (done, total) =>
        setProgress({ done, total }),
      );
      toastSuccess(
        t('settings.importDone', {
          defaultValue:
            'Followed {{followed}}, blocked {{blocked}}, {{folders}} folders created.',
          followed: result.followed,
          blocked: result.blocked,
          folders: result.foldersCreated,
        }),
      );
      if (result.followFailed > 0) {
        toastError(
          t('settings.importPartial', {
            defaultValue:
              '{{count}} accounts could not be followed — run the import again to retry them.',
            count: result.followFailed,
          }),
        );
      }
    } catch {
      toastError(
        t('settings.importFailed', 'The import stopped early. What had already applied is kept.'),
      );
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  const handleImport = async () => {
    if (!address || importing) return;
    setImporting(true);
    try {
      const raw = await readJsonFile();
      if (!raw) return;
      const data = parseExport(raw);
      const plan = await planImport(data, address);

      const from = data.account.username || data.account.address.slice(0, 10);
      const when = data.exportedAt ? `, exported ${data.exportedAt.slice(0, 10)}` : '';
      Alert.alert(
        t('settings.importReview', 'Apply this import?'),
        [
          `From ${from}${when}.`,
          `· Follow ${plan.toFollow.length} accounts${
            plan.alreadyFollowing > 0 ? ` (${plan.alreadyFollowing} already followed)` : ''
          }`,
          `· Block ${plan.toBlock.length} accounts`,
          `· Create ${plan.foldersToCreate.length} bookmark folders, fill ${plan.foldersToFill}`,
          '· Restore your playback settings',
          '',
          'Following and blocking happen as you, on this account. Nothing is removed.',
        ].join('\n'),
        [
          { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          { text: t('settings.applyImport', 'Apply'), onPress: () => void runImport(plan) },
        ],
      );
    } catch (e: any) {
      toastError(e?.message || t('settings.importUnreadable', 'That file could not be read.'));
    } finally {
      // The apply run owns the flag from here; this only releases the pick.
      setImporting(false);
    }
  };

  if (!address) return null;

  return (
    <SettingsSection label={t('settings.yourData')} icon="Download">
      <SettingsLinkRow
        icon="Download"
        label={t('settings.extractData')}
        description={t(
          'settings.extractDataDescMobile',
          'Save everything on this account as one file: follows, blocks, saved posts, bookmark folders and settings.',
        )}
        value={exporting ? t('settings.working', 'Working…') : t('settings.download')}
        disabled={exporting}
        onPress={handleExport}
      />
      <Divider />
      <SettingsLinkRow
        icon="Upload"
        label={t('settings.importData', 'Import data')}
        description={
          progress
            ? t('settings.importProgress', {
                defaultValue: 'Applying {{done}} of {{total}}…',
                done: progress.done,
                total: progress.total,
              })
            : t(
                'settings.importDataDesc',
                'Bring an export into this account: follow the same people, restore blocks and folders. You see the numbers before anything is applied.',
              )
        }
        value={importing ? t('settings.working', 'Working…') : t('settings.choose', 'Choose file')}
        disabled={importing}
        onPress={handleImport}
      />
    </SettingsSection>
  );
};

export default DataPortabilitySection;
