/**
 * Stream key — permanent credentials for OBS, a capture app or a console
 * ======================================================================
 * Settings → Profile. Mirrors web's `StreamKeySettings`
 * (dehubweb src/components/app/settings/StreamKeySettings.tsx).
 *
 * Everything else about going live is minted per broadcast: the path a stream
 * publishes to IS its playbackId, and its key is the credential for that one
 * path. The app is handed both at the moment it needs them and shows them to
 * nobody. An encoder cannot work that way — it is set up once, by hand, often
 * with a controller — so a creator who has to re-key it before every session
 * ends up creating a live post purely to produce a key.
 *
 * The pair here never changes. Set the encoder up once, press its own Start
 * button, and the post is created when the broadcast arrives: bound to one set
 * up in the app in the last couple of hours if there is one, or published on
 * the spot under the default title.
 *
 * The key is the publish credential, so it is masked until tapped and
 * rotatable. Rotating leaves the server address alone — the answer to
 * "somebody has my key" is a new secret, not a new address to re-type as well
 * — and never touches a broadcast already running, which publishes with its
 * own stream's key rather than this one.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import Icon from '../ui/Icon';
import { Divider, SettingsSection } from './SettingsPrimitives';
import { copyToClipboard } from '../../libs';
import { toastError, toastSuccess } from '../../libs/toast';
import { encoderKeyService, type EncoderCredentials } from '../../services/encoder-key.service';

export function StreamKeySection() {
  const { t } = useTranslation();
  const alive = useRef(true);

  // `undefined` while it loads, so the panel does not flash "not available" at
  // a creator who has perfectly good credentials.
  const [credentials, setCredentials] = useState<EncoderCredentials | undefined | null>(undefined);
  const [title, setTitle] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    alive.current = true;
    encoderKeyService
      .get()
      .then(next => {
        if (!alive.current) return;
        setCredentials(next);
        setTitle(next.defaultTitle);
      })
      .catch(() => alive.current && setCredentials(null));
    return () => {
      alive.current = false;
    };
  }, []);

  const copy = useCallback(
    async (value: string, message: string) => {
      if (!value) return;
      await copyToClipboard(value);
      toastSuccess(message);
    },
    [],
  );

  const rotate = useCallback(() => {
    // A permanent credential that cannot be revoked is a liability, and a
    // rotation silently breaks every encoder it was pasted into — so it is
    // confirmed rather than one tap away from a misplaced thumb.
    Alert.alert(
      t('settings.streamKey.rotate', 'Reset stream key'),
      t(
        'settings.streamKey.rotateConfirm',
        'Issue a new stream key? Every encoder using the old one will stop working until you paste the new key in.',
      ),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('settings.streamKey.rotate', 'Reset stream key'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const next = await encoderKeyService.rotate();
              if (!alive.current) return;
              setCredentials(next);
              setRevealed(true);
              toastSuccess(t('settings.streamKey.rotated', 'New stream key issued'));
            } catch (e) {
              toastError(e, t('settings.streamKey.rotateFailed', 'Could not issue a new key'));
            } finally {
              if (alive.current) setBusy(false);
            }
          },
        },
      ],
    );
  }, [t]);

  const saveTitle = useCallback(async () => {
    if (!credentials || title === credentials.defaultTitle) return;
    setBusy(true);
    try {
      const next = await encoderKeyService.setDefaultTitle(title);
      if (!alive.current) return;
      setCredentials(next);
      setTitle(next.defaultTitle);
      toastSuccess(t('settings.streamKey.titleSaved', 'Saved'));
    } catch (e) {
      toastError(e, t('settings.streamKey.titleFailed', 'Could not save the title'));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [credentials, title, t]);

  const loading = credentials === undefined;
  const unavailable = !loading && (!credentials?.server || !credentials?.streamKey);

  return (
    <SettingsSection label={t('settings.streamKey.section', 'Stream key')} icon="Radio" anchor="stream-key">
      <View className="px-4 py-3.5">
        <Text className="text-theme-neutrals-400 text-xs leading-5">
          {t(
            'settings.streamKey.blurb',
            'Paste these into OBS, your capture app or your console once. They never change — press Start in your encoder and DeHub creates the live post for you.',
          )}
        </Text>
      </View>

      {loading ? (
        <View className="px-4 pb-4">
          <ActivityIndicator size="small" color="#8B8D90" />
        </View>
      ) : null}

      {unavailable ? (
        <View className="px-4 pb-4">
          <Text className="text-theme-neutrals-500 text-xs">
            {t(
              'settings.streamKey.unavailable',
              'Streaming from an encoder is not available on your account right now.',
            )}
          </Text>
        </View>
      ) : null}

      {!loading && !unavailable && credentials ? (
        <>
          <Divider />

          <View className="px-4 py-3.5">
            <Text className="text-white text-sm font-medium">
              {t('settings.streamKey.server', 'Server')}
            </Text>
            <View className="flex-row items-center mt-2">
              <Text
                selectable
                numberOfLines={1}
                className="flex-1 mr-2 px-3 py-2.5 rounded-xl bg-theme-neutrals-700/50 text-white text-xs"
              >
                {credentials.server}
              </Text>
              <TouchableOpacity
                onPress={() => copy(credentials.server, t('settings.streamKey.serverCopied', 'Server copied'))}
                activeOpacity={0.7}
                className="px-3 py-2.5 rounded-xl bg-theme-neutrals-700/60"
              >
                <Icon name="Copy" size={13} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <Divider />

          <View className="px-4 py-3.5">
            <Text className="text-white text-sm font-medium">
              {t('settings.streamKey.key', 'Stream key')}
            </Text>
            <View className="flex-row items-center mt-2">
              <Text
                selectable={revealed}
                numberOfLines={1}
                className="flex-1 mr-2 px-3 py-2.5 rounded-xl bg-theme-neutrals-700/50 text-white text-xs"
              >
                {revealed ? credentials.streamKey : '•'.repeat(24)}
              </Text>
              <TouchableOpacity
                onPress={() => setRevealed(v => !v)}
                activeOpacity={0.7}
                className="mr-2 px-3 py-2.5 rounded-xl bg-theme-neutrals-700/60"
              >
                <Icon name={revealed ? 'EyeOff' : 'Eye'} size={13} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => copy(credentials.streamKey, t('settings.streamKey.keyCopied', 'Stream key copied'))}
                activeOpacity={0.7}
                className="px-3 py-2.5 rounded-xl bg-theme-neutrals-700/60"
              >
                <Icon name="Copy" size={13} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text className="text-theme-neutrals-500 text-xs mt-2">
              {t(
                'settings.streamKey.keyWarning',
                'Anyone holding this key can broadcast as you. Never show it on stream.',
              )}
            </Text>
          </View>

          <Divider />

          <View className="px-4 py-3.5">
            <Text className="text-white text-sm font-medium">
              {t('settings.streamKey.defaultTitle', 'Default stream title')}
            </Text>
            <View className="flex-row items-center mt-2">
              <TextInput
                value={title}
                onChangeText={setTitle}
                onBlur={saveTitle}
                maxLength={120}
                editable={!busy}
                placeholder={t(
                  'settings.streamKey.defaultTitlePlaceholder',
                  'What your encoder streams are called',
                )}
                placeholderTextColor="#52525b"
                className="flex-1 mr-2 px-3 py-2.5 rounded-xl bg-theme-neutrals-700/50 text-white text-sm"
              />
              <TouchableOpacity
                onPress={saveTitle}
                disabled={busy || title === credentials.defaultTitle}
                activeOpacity={0.7}
                className={`px-4 py-2.5 rounded-xl bg-white ${
                  busy || title === credentials.defaultTitle ? 'opacity-40' : ''
                }`}
              >
                <Text className="text-[#09090B] text-sm font-medium">
                  {t('common.save', 'Save')}
                </Text>
              </TouchableOpacity>
            </View>
            <Text className="text-theme-neutrals-500 text-xs mt-2">
              {t(
                'settings.streamKey.defaultTitleHint',
                'Used when you go live from an encoder without setting a post up first.',
              )}
            </Text>
          </View>

          <Divider />

          <View className="px-4 py-3.5">
            <TouchableOpacity
              onPress={rotate}
              disabled={busy}
              activeOpacity={0.7}
              className={`self-start px-4 py-2.5 rounded-xl bg-theme-neutrals-700/60 flex-row items-center ${
                busy ? 'opacity-40' : ''
              }`}
            >
              <Icon name="RefreshCw" size={13} color="#fff" />
              <Text className="text-white text-sm font-medium ml-1.5">
                {t('settings.streamKey.rotate', 'Reset stream key')}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </SettingsSection>
  );
}

export default StreamKeySection;
