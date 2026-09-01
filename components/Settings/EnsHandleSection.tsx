/**
 * ENS name — prove you hold a `.eth` name and be reachable at dehub.io/<name>
 * ===========================================================================
 * Settings → Profile. Mirrors web's `EnsHandleSettings`
 * (dehubweb src/components/app/settings/EnsHandleSettings.tsx).
 *
 * The username is never touched by anything here. This is an alias: linking
 * adds a URL and a chip on the profile, unlinking removes them, and the account
 * is called the same thing throughout. That is also why there is no "is this
 * name available" race to worry about — usernames cannot contain a dot, so a
 * `.eth` name can never collide with one.
 *
 * **Why there is no "connect wallet" button, and must not be one.**
 *
 * The signature has to come from the wallet the name points at, which is
 * usually NOT the wallet you browse DeHub with. Web cannot connect a second
 * wallet because its AuthProvider clears the session on a foreign address. On
 * this client it is worse: the only connect path is `useWalletAuth`'s
 * `handleWalletConnect`, and every route through it ends in
 * `signInWithWallet(address, chainId)` — which snapshots the current account,
 * clears its keys and signs you in AS the wallet you just connected. Offering
 * that button here would mean "claim your ENS name" quietly switched accounts.
 *
 * So there are two paths, and the split is deliberate:
 *
 *  - **This session's own wallet already holds the name** — one tap, signed in
 *    place through the provider the session already owns. Nothing connects,
 *    nothing is displaced.
 *  - **Anything else** — copy the message, sign it wherever the name actually
 *    lives, paste the signature back. Clunkier, and the only thing that works
 *    for a hardware wallet, a multisig, or a name parked on a cold address.
 *    The audience for ENS names is comfortable signing a message; being locked
 *    out because the key is on another device would be the real failure.
 *
 * The message is never composed here. `challenge()` returns the exact text and
 * an `issuedAt` that goes back with the signature, so the server rebuilds what
 * was signed rather than trusting the client's idea of it.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';
import { Divider, SettingsSection } from './SettingsPrimitives';
import { copyToClipboard } from '../../libs';
import { toastError, toastSuccess } from '../../libs/toast';
import { useAuthActions, useProvider, useUser } from '../../context/AuthContext';
import {
  ensService,
  type EnsChallenge,
  type EnsLink,
  type EnsPreview,
} from '../../services/ens.service';

const shortAddress = (address: string) =>
  address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;

export function EnsHandleSection() {
  const { t } = useTranslation();
  const user = useUser();
  const { patchUser } = useAuthActions();
  const { provider } = useProvider();

  // `undefined` while the current link is still being read, so the panel does
  // not flash a claim box at somebody who already has a name.
  const [link, setLink] = useState<EnsLink | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<EnsPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<EnsChallenge | null>(null);
  const [signature, setSignature] = useState('');
  const [checking, setChecking] = useState(false);
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
    ensService
      .myLink()
      .then((current) => {
        if (cancelled) return;
        setLink(current);
        // Only offer a suggestion when there is nothing to replace. Most people
        // have never set a reverse record — it is a second, gas-costing
        // transaction — so this is usually null and the box stays empty. It has
        // to work perfectly without one.
        if (!current) {
          ensService
            .suggest()
            .then((suggested) => {
              if (!cancelled && suggested) setName(suggested);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled) setLink(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.address]);

  const sessionAddress = (user?.walletAddress || user?.address || '').toLowerCase();
  const holderIsThisSession =
    !!challenge && !!provider && sessionAddress === challenge.ensAddress.toLowerCase();

  /** Resolve what was typed, and stop if it is not a name we can use. */
  const check = useCallback(async () => {
    const typed = name.trim();
    if (!typed) return;
    setChecking(true);
    setPreviewError(null);
    setChallenge(null);
    setSignature('');
    try {
      const result = await ensService.preview(typed);
      if (!alive.current) return;
      setPreview(result);
      // The canonical form, not what was typed — so what the user then signs
      // for and what appears in their URL are visibly the same string.
      setName(result.name);
    } catch (e) {
      if (!alive.current) return;
      setPreview(null);
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setChecking(false);
    }
  }, [name]);

  const startChallenge = useCallback(async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const issued = await ensService.challenge(preview.name);
      if (alive.current) setChallenge(issued);
    } catch (e) {
      toastError(e, t('settings.ensChallengeFailed', 'Could not start the check. Try again.'));
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [preview, t]);

  const submit = useCallback(
    async (sig: string) => {
      if (!challenge || !sig.trim()) return;
      setBusy(true);
      try {
        const result = await ensService.link({
          name: challenge.name,
          issuedAt: challenge.issuedAt,
          signature: sig.trim(),
        });
        // Patch rather than refetch: the profile header reads ensName off the
        // session user, and a full account refresh here would be a second
        // round trip for one field the response already carries.
        await patchUser({ ensName: result.name });
        if (!alive.current) return;
        setLink(result);
        setChallenge(null);
        setPreview(null);
        setSignature('');
        toastSuccess(
          t('settings.ensLinked', 'Linked — your profile is also at {{url}}', {
            url: result.url,
          }),
        );
      } catch (e) {
        toastError(e, t('settings.ensLinkFailed', 'That signature was not accepted.'));
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [challenge, patchUser, t],
  );

  /**
   * The fast path: this session's wallet already is the one the name points at.
   *
   * The address is named explicitly rather than left to the provider's idea of
   * "current" — this button only appears when the session wallet IS the name's
   * address, and signing with anything else produces a signature the server
   * rejects with nothing to explain why. The parameter order is tried both ways
   * for the same reason libs/web3.auth.sign.ts does: wallets disagree about it.
   */
  const signHere = useCallback(async () => {
    if (!challenge || !provider) return;
    setBusy(true);
    try {
      let sig: string;
      try {
        sig = await provider.request({
          method: 'personal_sign',
          params: [challenge.message, sessionAddress],
        });
      } catch {
        sig = await provider.request({
          method: 'personal_sign',
          params: [sessionAddress, challenge.message],
        });
      }
      await submit(sig);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Backing out of a wallet prompt is not an error worth a red toast.
      if (!/reject|denied|cancell?ed/i.test(message)) toastError(e, message);
      if (alive.current) setBusy(false);
    }
  }, [challenge, provider, sessionAddress, submit]);

  const copyMessage = useCallback(() => {
    if (!challenge) return;
    copyToClipboard(challenge.message);
    toastSuccess(t('settings.ensCopied', 'Message copied — sign it with the wallet that holds the name'));
  }, [challenge, t]);

  const remove = useCallback(() => {
    Alert.alert(
      t('settings.ensRemoveTitle', 'Remove your ENS name?'),
      t(
        'settings.ensRemoveBody',
        'dehub.io/{{name}} stops resolving to you. Your username does not change, and you can prove the name again later — but that needs another signature from the wallet that holds it.',
        { name: link?.name ?? '' },
      ),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('settings.ensRemove', 'Remove'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await ensService.unlink();
              await patchUser({ ensName: null });
              if (!alive.current) return;
              setLink(null);
              toastSuccess(t('settings.ensUnlinked', 'Removed — your username is unchanged'));
            } catch (e) {
              toastError(e, t('settings.ensUnlinkFailed', 'Could not remove it. Try again.'));
            } finally {
              if (alive.current) setBusy(false);
            }
          },
        },
      ],
    );
  }, [link?.name, patchUser, t]);

  const loading = link === undefined;

  return (
    <SettingsSection label={t('settings.ensHandle', 'ENS name')} icon="Globe">
      <View className="px-4 py-3.5 flex-row items-center">
        <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
          <Icon name="Globe" size={18} color="#A6A9AC" />
        </View>
        <View className="flex-1 mr-2">
          <Text className="text-white text-sm font-medium">
            {link ? link.name : t('settings.ensHandle', 'ENS name')}
          </Text>
          <Text className="text-theme-neutrals-500 text-xs mt-0.5">
            {link
              ? t('settings.ensLinkedDesc', 'You are also at dehub.io/{{name}}', {
                  name: link.name,
                })
              : t(
                  'settings.ensHandleDesc',
                  'Prove you hold a .eth name to also be reachable at dehub.io/yourname.eth. Your username does not change.',
                )}
          </Text>
        </View>
        {loading ? <ActivityIndicator size="small" color="#8B8D90" /> : null}
        {link ? (
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
                {t('settings.ensRemove', 'Remove')}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {!link && !loading ? (
        <>
          <Divider />
          <View className="px-4 py-3">
            <View className="flex-row items-center">
              <TextInput
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  setPreview(null);
                  setChallenge(null);
                  setPreviewError(null);
                }}
                placeholder="yourname.eth"
                placeholderTextColor="#52525b"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                editable={!checking && !busy}
                onSubmitEditing={check}
                returnKeyType="search"
                className="flex-1 mr-2 px-3 py-2.5 rounded-xl bg-theme-neutrals-700/50 text-white text-sm"
              />
              <TouchableOpacity
                onPress={check}
                disabled={checking || !name.trim() || !!preview}
                activeOpacity={0.7}
                className={`px-4 py-2.5 rounded-xl bg-white ${
                  checking || !name.trim() || !!preview ? 'opacity-40' : ''
                }`}
              >
                {checking ? (
                  <ActivityIndicator size="small" color="#09090B" />
                ) : (
                  <Text className="text-[#09090B] text-sm font-medium">
                    {t('settings.ensCheck', 'Check')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {previewError ? (
              <Text className="text-white/80 text-xs mt-2">{previewError}</Text>
            ) : null}

            {preview && !challenge ? (
              <View className="mt-3">
                <Text className="text-theme-neutrals-400 text-xs leading-5">
                  {t('settings.ensResolvesTo', '{{name}} points at {{address}}', {
                    name: preview.name,
                    address: shortAddress(preview.ensAddress),
                  })}
                </Text>
                {preview.held ? (
                  <Text className="text-amber-400 text-xs leading-5 mt-1">
                    {t(
                      'settings.ensHeld',
                      'Another DeHub account already wears this name. If it has changed hands on-chain since, proving it now takes it back.',
                    )}
                  </Text>
                ) : null}
                <TouchableOpacity
                  onPress={startChallenge}
                  disabled={busy}
                  activeOpacity={0.7}
                  className={`mt-3 self-start px-4 py-2.5 rounded-xl bg-white ${
                    busy ? 'opacity-40' : ''
                  }`}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#09090B" />
                  ) : (
                    <Text className="text-[#09090B] text-sm font-medium">
                      {t('settings.ensContinue', 'Continue')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}

            {challenge ? (
              <View className="mt-3">
                <Text className="text-theme-neutrals-400 text-xs leading-5">
                  {t(
                    'settings.ensSignWith',
                    'Sign this with the wallet {{address}} holds — not necessarily the one you are signed in with. It moves no funds.',
                    { address: shortAddress(challenge.ensAddress) },
                  )}
                </Text>

                <ScrollView
                  className="mt-2 max-h-32 rounded-xl bg-theme-neutrals-900/60 p-3"
                  nestedScrollEnabled
                >
                  <Text selectable className="text-theme-neutrals-300 text-[11px] leading-4">
                    {challenge.message}
                  </Text>
                </ScrollView>

                <View className="flex-row items-center mt-2">
                  {holderIsThisSession ? (
                    <TouchableOpacity
                      onPress={signHere}
                      disabled={busy}
                      activeOpacity={0.7}
                      className={`mr-2 px-4 py-2.5 rounded-xl bg-white ${busy ? 'opacity-40' : ''}`}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#09090B" />
                      ) : (
                        <Text className="text-[#09090B] text-sm font-medium">
                          {t('settings.ensSignHere', 'Sign with this wallet')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={copyMessage}
                    activeOpacity={0.7}
                    className="px-4 py-2.5 rounded-xl bg-theme-neutrals-700/60 flex-row items-center"
                  >
                    <Icon name="Copy" size={13} color="#fff" />
                    <Text className="text-white text-sm font-medium ml-1.5">
                      {t('settings.ensCopy', 'Copy message')}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View className="flex-row items-center mt-2">
                  <TextInput
                    value={signature}
                    onChangeText={setSignature}
                    placeholder={t('settings.ensPasteSignature', 'Paste signature (0x…)')}
                    placeholderTextColor="#52525b"
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    editable={!busy}
                    className="flex-1 mr-2 px-3 py-2.5 rounded-xl bg-theme-neutrals-700/50 text-white text-sm"
                  />
                  <TouchableOpacity
                    onPress={() => submit(signature)}
                    disabled={busy || !signature.trim()}
                    activeOpacity={0.7}
                    className={`px-4 py-2.5 rounded-xl bg-white ${
                      busy || !signature.trim() ? 'opacity-40' : ''
                    }`}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color="#09090B" />
                    ) : (
                      <Text className="text-[#09090B] text-sm font-medium">
                        {t('settings.ensLink', 'Link')}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                <Text className="text-theme-neutrals-500 text-xs mt-2">
                  {t(
                    'settings.ensExpires',
                    'This expires in 15 minutes. Check the name again to get a fresh one.',
                  )}
                </Text>
              </View>
            ) : null}
          </View>
        </>
      ) : null}
    </SettingsSection>
  );
}

export default EnsHandleSection;
