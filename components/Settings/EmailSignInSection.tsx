/**
 * Sign-in email — attach an address a wallet account can log in with instead
 * ============================================================================
 * Settings → Profile → Sign-in. Mirrors web's `EmailSignInSettings`
 * (dehubweb src/components/app/settings/EmailSignInSettings.tsx).
 *
 * The backend owns every rule (cooldowns, caps, collisions, which links may be
 * removed); this only shuttles the send-code → confirm handshake and toasts the
 * server's copy verbatim.
 *
 * An account whose email login came from a social signup (`canLink === false`
 * while not linked) is shown the address and offered nothing: that link is how
 * it gets back in on other devices, and must not be replaced from here.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';
import { Divider, SettingsSection } from './SettingsPrimitives';
import { toastError, toastSuccess } from '../../libs/toast';
import { useUser } from '../../context/AuthContext';
import {
  confirmEmailLink,
  getEmailLinkStatus,
  requestEmailLinkCode,
  unlinkEmailLogin,
  type EmailLinkStatus,
} from '../../services/email-link.service';

const EMAIL_SHAPE = /.+@.+\..+/;

/** Local stand-in for the rare case confirm answers without the masked copy. */
function maskLocal(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

export function EmailSignInSection() {
  const { t } = useTranslation();
  const user = useUser();

  // `undefined` while the status is still being read, so nothing flashes a
  // form at somebody who already has an address attached.
  const [status, setStatus] = useState<EmailLinkStatus | null | undefined>(undefined);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [busy, setBusy] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getEmailLinkStatus().then((s) => {
      if (cancelled) return;
      // A failed read still offers the form; the server refuses anything it
      // would not have allowed, with copy that says why.
      setStatus(
        s ?? { status: false, linked: false, email: null, canLink: true, source: null },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [user?.address]);

  const sendCode = async () => {
    const typed = email.trim();
    if (!EMAIL_SHAPE.test(typed)) return;
    setBusy(true);
    try {
      await requestEmailLinkCode(typed);
      if (!alive.current) return;
      setAwaitingCode(true);
      toastSuccess(t('settings.emailSignInSent', 'Check your inbox for the code'));
    } catch (e) {
      toastError(e, t('common.somethingWentWrong'));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const confirm = async () => {
    const typed = email.trim();
    if (!typed || code.length !== 6) return;
    setBusy(true);
    try {
      const result = await confirmEmailLink(typed, code);
      if (!alive.current) return;
      setAwaitingCode(false);
      setCode('');
      setEmail('');
      setStatus({
        status: true,
        linked: true,
        email: result.email ?? maskLocal(typed),
        canLink: true,
        source: 'wallet-email',
      });
      toastSuccess(t('settings.emailSignInDone', 'You can now sign in with this email'));
    } catch (e) {
      toastError(e, t('common.somethingWentWrong'));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await unlinkEmailLogin();
      if (!alive.current) return;
      setStatus({ status: true, linked: false, email: null, canLink: true, source: null });
      setEmail('');
      setCode('');
      setAwaitingCode(false);
      toastSuccess(
        t('settings.emailSignInRemoved', 'Removed — this email can no longer sign you in'),
      );
    } catch (e) {
      toastError(e, t('common.somethingWentWrong'));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const loading = status === undefined;
  const linked = !!status?.linked;
  const foreignLogin = !!status && !status.linked && status.canLink === false;

  const description = linked
    ? t('settings.emailSignInLinked', 'Code login is active for {{email}}', {
        email: status?.email ?? '',
      })
    : foreignLogin
      ? status?.email
        ? t('settings.emailSignInExisting', 'You already sign in with {{email}}', {
            email: status.email,
          })
        : t(
            'settings.emailSignInExistingUnknown',
            'This account already signs in without a wallet.',
          )
      : t('settings.emailSignInDesc', 'Attach an email address to sign in without your wallet.');

  const emailValid = EMAIL_SHAPE.test(email.trim());

  return (
    <SettingsSection label={t('settings.signIn', 'Sign-in')} icon="Mail">
      <View className="px-4 py-3.5 flex-row items-center">
        <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
          <Icon name="Mail" size={18} color="#A6A9AC" />
        </View>
        <View className="flex-1 mr-2">
          <Text className="text-white text-sm font-medium">
            {t('settings.emailSignIn', 'Sign-in email')}
          </Text>
          <Text className="text-theme-neutrals-500 text-xs mt-0.5">{description}</Text>
        </View>
        {loading ? <ActivityIndicator size="small" color="#8B8D90" /> : null}
        {linked ? (
          <TouchableOpacity
            onPress={remove}
            disabled={busy}
            activeOpacity={0.7}
            className={`px-3 py-2 rounded-xl bg-theme-neutrals-700/60 ${busy ? 'opacity-40' : ''}`}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-white text-xs font-medium">
                {t('settings.emailSignInRemove', 'Remove')}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {!loading && !linked && !foreignLogin ? (
        <>
          <Divider />
          <View className="px-4 py-3">
            {awaitingCode ? (
              <View className="flex-row items-center">
                <TextInput
                  value={code}
                  onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  placeholderTextColor="#52525b"
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={6}
                  editable={!busy}
                  onSubmitEditing={confirm}
                  className="flex-1 mr-2 px-3 py-2.5 rounded-xl bg-theme-neutrals-700/50 text-white text-sm tracking-widest"
                />
                <TouchableOpacity
                  onPress={confirm}
                  disabled={busy || code.length !== 6}
                  activeOpacity={0.7}
                  className={`mr-2 px-4 py-2.5 rounded-xl bg-white ${
                    busy || code.length !== 6 ? 'opacity-40' : ''
                  }`}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#09090B" />
                  ) : (
                    <Text className="text-[#09090B] text-sm font-medium">
                      {t('settings.emailSignInConfirm', 'Confirm')}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setAwaitingCode(false);
                    setCode('');
                  }}
                  disabled={busy}
                  activeOpacity={0.7}
                  className="px-3 py-2.5 rounded-xl bg-theme-neutrals-700/60"
                >
                  <Text className="text-white text-sm font-medium">
                    {t('common.cancel', 'Cancel')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="flex-row items-center">
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#52525b"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  editable={!busy}
                  onSubmitEditing={sendCode}
                  returnKeyType="send"
                  className="flex-1 mr-2 px-3 py-2.5 rounded-xl bg-theme-neutrals-700/50 text-white text-sm"
                />
                <TouchableOpacity
                  onPress={sendCode}
                  disabled={busy || !emailValid}
                  activeOpacity={0.7}
                  className={`px-4 py-2.5 rounded-xl bg-white ${
                    busy || !emailValid ? 'opacity-40' : ''
                  }`}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#09090B" />
                  ) : (
                    <Text className="text-[#09090B] text-sm font-medium">
                      {t('settings.emailSignInSend', 'Send code')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </>
      ) : null}
    </SettingsSection>
  );
}

export default EmailSignInSection;
