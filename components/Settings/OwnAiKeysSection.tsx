/**
 * Your own AI keys — Settings → Profile. Mirrors web's `OwnAiKeysSetting`
 * (dehubweb src/components/app/settings/OwnAiKeysSetting.tsx).
 *
 * A creator pastes a provider key once; Creator tools on that provider then
 * run on their account and Riftn charges nothing. The server checks the key
 * with one free call before saving and only ever sends back the last 4.
 * Hidden when the server can't list providers.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Divider, SettingsSection } from './SettingsPrimitives';
import { toastError, toastSuccess } from '../../libs/toast';
import {
  listProviderKeys,
  removeProviderKey,
  saveProviderKey,
  testProviderKey,
  type ProviderKeyRow,
  type ProviderKeyStatus,
} from '../../services/provider-keys.service';

const BUTTON = 'h-9 px-3 rounded-xl justify-center bg-white/5 border border-theme-neutrals-700';

export default function OwnAiKeysSection() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ProviderKeyRow[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    listProviderKeys().then(setRows).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!rows || rows.length === 0) return null;

  const statusLabel = (status: ProviderKeyStatus) =>
    ({
      working: t('ownKeys.working', 'Working'),
      invalid: t('ownKeys.invalid', 'Rejected, replace it'),
      no_credit: t('ownKeys.noCredit', 'Out of credit'),
      disabled: t('ownKeys.disabled', 'Turned off by Riftn'),
    })[status];

  const run = async (id: string, work: () => Promise<void>) => {
    setBusy(id);
    try {
      await work();
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('ownKeys.failed', 'Something went wrong. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const save = (row: ProviderKeyRow) =>
    run(row.id, async () => {
      const result = await saveProviderKey(row.id, draft.trim());
      setDraft('');
      setEditing(null);
      toastSuccess(
        result.status === 'no_credit'
          ? t('ownKeys.savedNoCredit', '{{name}} key saved, but the account is out of credit.', { name: row.label })
          : t('ownKeys.saved', '{{name}} key saved. Tools on {{name}} now use your account.', { name: row.label }),
      );
      load();
    });

  const recheck = (row: ProviderKeyRow) =>
    run(row.id, async () => {
      const result = await testProviderKey(row.id);
      toastSuccess(`${row.label}: ${statusLabel(result.status)}`);
      load();
    });

  const remove = (row: ProviderKeyRow) =>
    run(row.id, async () => {
      await removeProviderKey(row.id);
      toastSuccess(t('ownKeys.removed', '{{name}} key removed.', { name: row.label }));
      load();
    });

  const saved = rows.filter((row) => row.saved);
  const visible = showAll || saved.length === 0 ? rows : saved;

  const action = (label: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress} disabled={!!busy} activeOpacity={0.7} accessibilityRole="button" className={BUTTON}>
      <Text className="text-white text-sm font-medium">{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SettingsSection
      label={t('ownKeys.title', 'Your own AI keys')}
      icon="KeyRound"
      anchor="own-ai-keys"
      note={t(
        'ownKeys.description',
        'Add a key from an AI provider and Creator tools run on your account instead. Riftn charges nothing for those jobs. Keys are encrypted and never shown again.',
      )}
    >
      {visible.map((row, index) => (
        <React.Fragment key={row.id}>
          {index > 0 ? <Divider /> : null}
          <View className="px-4 py-3" testID="own-key-row">
            <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
              <View className="flex-1" style={{ minWidth: 140 }}>
                <Text numberOfLines={1} className="text-white text-sm font-medium">
                  {row.label}
                  {row.saved ? <Text className="text-theme-neutrals-500 text-xs">{`  ••••${row.saved.last4}`}</Text> : null}
                </Text>
                <Text numberOfLines={1} className="text-theme-neutrals-500 text-xs mt-0.5">
                  {row.saved ? statusLabel(row.saved.status) : row.powers}
                </Text>
              </View>
              <View className="flex-row items-center" style={{ gap: 8 }}>
                {busy === row.id ? <ActivityIndicator size="small" color="#71717a" /> : null}
                {row.saved ? (
                  <>
                    {action(t('ownKeys.replaceKey', 'Replace key'), () => { setEditing(row.id); setDraft(''); })}
                    {row.saved.status !== 'invalid' ? action(t('ownKeys.check', 'Check'), () => void recheck(row)) : null}
                    {action(t('ownKeys.remove', 'Remove'), () => void remove(row))}
                  </>
                ) : editing !== row.id ? (
                  action(t('ownKeys.add', 'Add key'), () => { setEditing(row.id); setDraft(''); })
                ) : null}
              </View>
            </View>
            {editing === row.id ? (
              <>
                <View className="flex-row items-center mt-2" style={{ gap: 8 }}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    textContentType="none"
                    autoFocus
                    editable={!busy}
                    placeholder={t('ownKeys.paste', 'Paste your {{name}} key', { name: row.label })}
                    placeholderTextColor="#52525b"
                    onSubmitEditing={() => void save(row)}
                    className="flex-1 px-3 py-2.5 rounded-xl bg-theme-neutrals-700/50 text-white text-sm"
                  />
                  <TouchableOpacity
                    onPress={() => void save(row)}
                    disabled={!!busy || draft.trim().length < 8}
                    activeOpacity={0.7}
                    className={`px-4 py-2.5 rounded-xl bg-white ${busy || draft.trim().length < 8 ? 'opacity-40' : ''}`}
                  >
                    <Text className="text-[#09090B] text-sm font-medium">{t('ownKeys.save', 'Save')}</Text>
                  </TouchableOpacity>
                </View>
                <View className="flex-row items-center mt-2" style={{ gap: 16 }}>
                  <TouchableOpacity onPress={() => void Linking.openURL(row.keysUrl)} accessibilityRole="link">
                    <Text className="text-theme-neutrals-400 text-xs underline">
                      {t('ownKeys.getKey', 'Get a {{name}} key', { name: row.label })}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditing(null); setDraft(''); }} accessibilityRole="button">
                    <Text className="text-theme-neutrals-400 text-xs underline">{t('ownKeys.cancel', 'Cancel')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        </React.Fragment>
      ))}
      {saved.length > 0 && saved.length < rows.length ? (
        <>
          <Divider />
          <TouchableOpacity onPress={() => setShowAll((v) => !v)} className="px-4 py-3" accessibilityRole="button">
            <Text className="text-theme-neutrals-400 text-xs underline">
              {showAll ? t('ownKeys.showLess', 'Show only my keys') : t('ownKeys.addAnother', 'Add another provider')}
            </Text>
          </TouchableOpacity>
        </>
      ) : null}
    </SettingsSection>
  );
}
