/**
 * Settings > Privacy > Account security > Two-step sign-in.
 *
 * The row says whether it is on; the sheet walks through turning it on (add
 * to an authenticator app, type a code, save 10 backup codes) and, once on,
 * getting new backup codes or turning it off. Same steps and words as the
 * website's TwoFactorSheet. The server owns the secret and every check.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import qrcode from 'qrcode-generator';
import Svg, { Path } from 'react-native-svg';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import GlassModal from '../ui/GlassModal';
import { SettingsLinkRow } from './SettingsPrimitives';
import TwoFactorCodeBoxes from '../auth/TwoFactorCodeBoxes';
import { AuthButton, AuthErrorNotice, AuthTextButton, authColors, authText } from '../auth/AuthControls';
import { TwoFactorService, type TwoFactorStatus } from '../../services/two-factor.service';
import { toastSuccess } from '../../libs';

type Step = 'intro' | 'link' | 'confirm' | 'codes' | 'manage' | 'off' | 'new-codes';

const STATUS_KEY = ['two-factor-status'];

export default function TwoFactorSettingsRow() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: status } = useQuery({ queryKey: STATUS_KEY, queryFn: TwoFactorService.status, staleTime: 60_000 });

  const description = status?.enabled
    ? t('twoFactor.rowOn', 'On. {{count}} backup codes left.', { count: status.backupCodesLeft })
    : t('twoFactor.rowOff', 'Ask for a code from your authenticator app at sign-in.');

  return (
    <>
      <SettingsLinkRow
        icon="Shield"
        label={t('twoFactor.title', 'Two-step sign-in')}
        description={description}
        onPress={() => setOpen(true)}
      />
      <TwoFactorSheet open={open} onClose={() => setOpen(false)} status={status} />
    </>
  );
}

function TwoFactorSheet({ open, onClose, status }: { open: boolean; onClose: () => void; status?: TwoFactorStatus }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('intro');
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  // Each opening starts from the top: manage when on, intro when off.
  useEffect(() => {
    if (!open) return;
    setStep(status?.enabled ? 'manage' : 'intro');
    setSetup(null);
    setShowQr(false);
    setCode('');
    setError(null);
    setCodes([]);
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: STATUS_KEY }), [queryClient]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || t('twoFactor.wrongCode', 'That code didn’t match. Try the newest one in your app.'));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const start = () => run(async () => {
    setSetup(await TwoFactorService.setup());
    setStep('link');
  });

  const confirm = (value = code) => run(async () => {
    if (value.length !== 6) return;
    const res = await TwoFactorService.enable(value);
    setCodes(res.backupCodes);
    setStep('codes');
    void refresh();
  });

  const turnOff = (value = code) => run(async () => {
    if (value.length !== 6) return;
    await TwoFactorService.disable(value);
    void refresh();
    toastSuccess(t('twoFactor.turnedOff', 'Two-step sign-in is off'));
    onClose();
  });

  const newCodes = (value = code) => run(async () => {
    if (value.length !== 6) return;
    const res = await TwoFactorService.regenerateBackupCodes(value);
    setCodes(res.backupCodes);
    setSaved(false);
    setStep('codes');
    void refresh();
  });

  const openAuthenticator = async () => {
    if (!setup) return;
    try {
      await Linking.openURL(setup.otpauthUrl);
    } catch {
      setError(t('twoFactor.noApp', 'No authenticator app opened. Copy the setup key into your app instead.'));
    }
  };

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    toastSuccess(t('twoFactor.copied', 'Copied'));
  };

  const setupSteps: Step[] = ['intro', 'link', 'confirm', 'codes'];
  const stepIndex = setupSteps.indexOf(step);
  // The progress bar belongs to turning it on, not to getting new codes.
  const settingUp = stepIndex >= 0 && (step === 'intro' || !!setup);

  const enterCode = (title: string, body: string, action: (v?: string) => void, label: string) => (
    <View style={{ gap: 16 }}>
      <Header title={title} body={body} />
      <TwoFactorCodeBoxes
        value={code}
        onChange={(v) => { setCode(v); setError(null); }}
        onComplete={(v) => action(v)}
        invalid={!!error}
        disabled={busy}
      />
      <AuthErrorNotice message={error} />
      <AuthButton variant="primary" label={label} onPress={() => action()} loading={busy} disabled={busy || code.length !== 6} />
    </View>
  );

  return (
    <GlassModal visible={open} onClose={onClose} presentation="bottom" maxHeight="92%" dismissible={!busy && step !== 'codes'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 16 }}>
        {settingUp && (
          <View style={styles.progress} accessibilityElementsHidden>
            {setupSteps.map((s, i) => (
              <View key={s} style={[styles.progressBar, i <= stepIndex && styles.progressOn]} />
            ))}
          </View>
        )}

        {step === 'intro' && (
          <View style={{ gap: 16 }}>
            <View style={styles.badge}><Ionicons name="lock-closed" size={28} color={authColors.label} /></View>
            <Header
              title={t('twoFactor.introTitle', 'Add a second lock')}
              body={t('twoFactor.introBody', 'Signing in will also ask for a 6-digit code from an authenticator app on your phone, like Google Authenticator, Authy or 1Password. Someone with your password, email or wallet still can’t get in without it.')}
            />
            <AuthErrorNotice message={error} />
            <AuthButton variant="primary" label={t('twoFactor.getStarted', 'Get started')} onPress={start} loading={busy} disabled={busy} />
          </View>
        )}

        {step === 'link' && setup && (
          <View style={{ gap: 16 }}>
            <Header
              title={t('twoFactor.linkTitle', 'Link your authenticator app')}
              body={t('twoFactor.linkBodyPhone', 'Tap the button to add Riftn to your authenticator app. On another device? Show the QR code and scan it there.')}
            />
            <AuthButton variant="primary" icon="add-circle-outline" label={t('twoFactor.addToApp', 'Add to authenticator app')} onPress={openAuthenticator} />
            <View style={styles.keyBox}>
              <Text style={authText.caption}>{t('twoFactor.setupKey', 'Setup key')}</Text>
              <Text selectable style={styles.key}>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</Text>
              <AuthTextButton label={t('common.copy', 'Copy')} onPress={() => void copy(setup.secret)} tone="default" />
            </View>
            {showQr ? <Qr value={setup.otpauthUrl} /> : (
              <AuthTextButton label={t('twoFactor.showQr', 'Show QR code')} onPress={() => setShowQr(true)} tone="default" />
            )}
            <AuthErrorNotice message={error} />
            <AuthButton variant="secondary" label={t('twoFactor.next', 'Next')} onPress={() => { setError(null); setStep('confirm'); }} />
          </View>
        )}

        {step === 'confirm' && enterCode(
          t('twoFactor.confirmTitle', 'Enter the code from your app'),
          t('twoFactor.confirmBody', 'Type the 6-digit code your app shows for Riftn. It changes every 30 seconds.'),
          confirm,
          t('twoFactor.turnOn', 'Turn on'),
        )}

        {step === 'codes' && (
          <View style={{ gap: 16 }}>
            <Header
              title={t('twoFactor.codesTitle', 'Save your backup codes')}
              body={t('twoFactor.codesBody', 'If you lose your phone, each of these codes lets you sign in once. Keep them somewhere safe, like a password manager.')}
            />
            <View style={styles.codes}>
              {codes.map((c) => <Text key={c} selectable style={styles.code}>{c}</Text>)}
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <AuthButton style={{ flex: 1 }} label={t('common.copy', 'Copy')} icon="copy-outline" onPress={() => void copy(codes.join('\n'))} />
              <AuthButton
                style={{ flex: 1 }}
                label={t('twoFactor.share', 'Share')}
                icon="share-outline"
                onPress={() => void Share.share({ message: `${t('twoFactor.codesFileTitle', 'Riftn backup codes')}\n\n${codes.join('\n')}` })}
              />
            </View>
            <Pressable onPress={() => setSaved((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: saved }} style={styles.saved}>
              <View style={[styles.check, saved && styles.checkOn]}>
                {saved && <Ionicons name="checkmark" size={14} color={authColors.onPrimary} />}
              </View>
              <Text style={authText.body}>{t('twoFactor.savedThem', 'I’ve saved these codes')}</Text>
            </Pressable>
            <AuthButton variant="primary" label={t('twoFactor.done', 'Done')} onPress={onClose} disabled={!saved} />
          </View>
        )}

        {step === 'manage' && (
          <View style={{ gap: 16 }}>
            <View style={styles.badge}><Ionicons name="shield-checkmark" size={28} color={authColors.label} /></View>
            <Header
              title={t('twoFactor.manageTitle', 'Two-step sign-in is on')}
              body={status?.enabledAt
                ? t('twoFactor.onSince', 'On since {{date}}', { date: new Date(status.enabledAt).toLocaleDateString() })
                : t('twoFactor.onShort', 'On')}
            />
            <View style={styles.keyBox}>
              <Text style={authText.emphasis}>{t('twoFactor.backupCodes', 'Backup codes')}</Text>
              <Text style={authText.body}>{t('twoFactor.codesLeft', '{{count}} left', { count: status?.backupCodesLeft ?? 0 })}</Text>
              <AuthTextButton label={t('twoFactor.getNew', 'Get new codes')} onPress={() => { setCode(''); setError(null); setStep('new-codes'); }} tone="default" />
            </View>
            <Text style={[authText.caption, { textAlign: 'center' }]}>
              {t('twoFactor.tip', 'New phone? Move your authenticator app first, or sign in with a backup code and set it up again.')}
            </Text>
            <AuthButton variant="danger" label={t('twoFactor.turnOff', 'Turn off')} onPress={() => { setCode(''); setError(null); setStep('off'); }} />
          </View>
        )}

        {step === 'off' && enterCode(
          t('twoFactor.offTitle', 'Turn off two-step sign-in?'),
          t('twoFactor.offBody', 'Enter a code from your app to confirm. Signing in will only need your usual login again.'),
          turnOff,
          t('twoFactor.turnOff', 'Turn off'),
        )}

        {step === 'new-codes' && enterCode(
          t('twoFactor.newCodesTitle', 'Get new backup codes'),
          t('twoFactor.newCodesBody', 'Enter a code from your app. Your old backup codes will stop working.'),
          newCodes,
          t('twoFactor.getNew', 'Get new codes'),
        )}

        {step !== 'codes' && (
          <AuthTextButton label={t('common.cancel', 'Cancel')} onPress={onClose} tone="muted" disabled={busy} />
        )}
      </ScrollView>
    </GlassModal>
  );
}

function Header({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[authText.modalTitle, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[authText.body, { textAlign: 'center' }]}>{body}</Text>
    </View>
  );
}

function Qr({ value }: { value: string }) {
  const qr = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(value);
    code.make();
    const size = code.getModuleCount();
    let path = '';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (code.isDark(y, x)) path += `M${x + 4},${y + 4}h1v1h-1z`;
    return { size: size + 8, path };
  }, [value]);
  return (
    <View style={styles.qr}>
      <Svg width={184} height={184} viewBox={`0 0 ${qr.size} ${qr.size}`}><Path fill="#000" d={qr.path} /></Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: 6 },
  progressBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)' },
  progressOn: { backgroundColor: authColors.label },
  badge: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: authColors.surface,
    borderWidth: 1,
    borderColor: authColors.border,
  },
  keyBox: {
    gap: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: authColors.surface,
    borderWidth: 1,
    borderColor: authColors.fieldBorder,
    alignItems: 'center',
  },
  key: { color: authColors.label, fontSize: 16, fontWeight: '600', letterSpacing: 1, textAlign: 'center' },
  qr: { alignSelf: 'center', padding: 8, borderRadius: 16, backgroundColor: '#FFFFFF' },
  codes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    padding: 16,
    borderRadius: 16,
    backgroundColor: authColors.surface,
    borderWidth: 1,
    borderColor: authColors.fieldBorder,
  },
  code: { width: '48%', color: authColors.label, fontSize: 15, fontWeight: '600', letterSpacing: 1, textAlign: 'center', fontVariant: ['tabular-nums'] },
  saved: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  check: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: authColors.primary, borderColor: authColors.primary },
});
