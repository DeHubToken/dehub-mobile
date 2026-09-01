import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenHeader from '../components/ScreenHeader';
import Icon from '../components/ui/Icon';
import GlassIndicator, { GLASS_SHADOW } from '../components/ui/GlassIndicator';
import { toastError, toastSuccess } from '../libs';
import {
  lookupPairing,
  resolvePairing,
  normalisePairingCode,
  isCompletePairingCode,
  type TvPairingTarget,
} from '../services/tvPairing.service';

type Phase = 'entry' | 'confirm' | 'done';

/**
 * Signing a television in from this phone.
 *
 * The screen is deliberately two steps rather than one. Typing a code and
 * having it take effect immediately is faster and wrong: what is being
 * authorised here is a full session on a device the person may not be able to
 * see, and the only thing standing between that and a device-code phishing
 * attack is a human reading "DeHub TV (SHIELD Android TV)" and deciding whether
 * that is the television in front of them.
 *
 * So: type the code, see what it is, then approve. The warning is stated in
 * plain terms on the confirm step rather than buried, because the failure mode
 * is somebody approving a code that arrived by message.
 */
export default function SignInTvScreen() {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<Phase>('entry');
  const [target, setTarget] = useState<TvPairingTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const complete = isCompletePairingCode(code);

  // Look the code up as soon as it is complete. It saves a tap, and — more to
  // the point — it means the device name is on screen before anyone has
  // decided anything.
  useEffect(() => {
    if (!complete || phase !== 'entry') return;
    let cancelled = false;
    setBusy(true);
    setNotFound(false);
    (async () => {
      const found = await lookupPairing(code);
      if (cancelled) return;
      setBusy(false);
      if (found) {
        Keyboard.dismiss();
        setTarget(found);
        setPhase('confirm');
      } else {
        setNotFound(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, complete, phase]);

  const answer = useCallback(
    async (approve: boolean) => {
      setBusy(true);
      const ok = await resolvePairing(code, approve);
      setBusy(false);
      if (!ok) {
        toastError('That code has expired. Ask the TV for a new one.');
        setPhase('entry');
        setCode('');
        return;
      }
      if (approve) {
        toastSuccess('Signed in on your TV');
        setPhase('done');
      } else {
        toastSuccess('Refused');
        setPhase('entry');
        setCode('');
      }
    },
    [code],
  );

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="Sign in a TV" />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {phase === 'entry' && (
          <View>
            <Text className="text-theme-neutrals-300 text-sm mb-4">
              Open DeHub on your television and type the code it shows here.
            </Text>

            <TextInput
              value={code}
              onChangeText={(v) => {
                setCode(normalisePairingCode(v));
                setNotFound(false);
              }}
              placeholder="XXXX-XXXX"
              placeholderTextColor="#6F7174"
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              maxLength={9}
              className="bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl px-4 py-4 text-white text-2xl font-bold"
              style={{ letterSpacing: 6, textAlign: 'center' }}
            />

            {busy && (
              <View className="flex-row items-center justify-center mt-4">
                <ActivityIndicator size="small" color="#9ca3af" />
                <Text className="text-theme-neutrals-500 text-xs ml-2">Checking…</Text>
              </View>
            )}

            {notFound && !busy && (
              <Text className="text-white/80 text-sm mt-4 text-center">
                No television is waiting on that code. It may have expired — ask the TV
                for a new one.
              </Text>
            )}
          </View>
        )}

        {phase === 'confirm' && !!target && (
          <View>
            <View className="rounded-xl overflow-hidden mb-4" style={GLASS_SHADOW}>
              <View className="bg-theme-neutrals-800 border border-theme-neutrals-700 rounded-xl px-4 py-5 items-center">
                <Icon name="Tv" size={32} color="#9ca3af" />
                <Text className="text-white text-lg font-bold mt-3">{target.deviceName}</Text>
                <Text className="text-theme-neutrals-500 text-xs mt-1">
                  wants to sign in as you
                </Text>
              </View>
            </View>

            {/* Stated plainly, on the step where the decision is made. The
                failure mode for every device-code flow ever built is somebody
                approving a code that arrived by message. */}
            <View className="bg-theme-neutrals-800/60 border border-theme-neutrals-700 rounded-xl px-4 py-3 mb-4">
              <Text className="text-theme-neutrals-300 text-xs leading-5">
                Only approve this if it is a television you are looking at right now.
                Approving signs whoever is holding that code into your account. It will
                be able to watch, like and follow — it cannot spend, and you can sign it
                out any time from Active sessions.
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => void answer(true)}
              disabled={busy}
              activeOpacity={0.7}
              className="rounded-xl overflow-hidden mb-3"
              style={{ opacity: busy ? 0.5 : 1 }}
            >
              <View className="px-4 py-4 rounded-xl items-center overflow-hidden" style={GLASS_SHADOW}>
                <GlassIndicator borderRadius={12} />
                {busy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white text-sm font-semibold">
                    Yes, sign in this TV
                  </Text>
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void answer(false)}
              disabled={busy}
              activeOpacity={0.7}
              className="px-4 py-4 rounded-xl border border-theme-neutrals-700 items-center"
              style={{ opacity: busy ? 0.5 : 1 }}
            >
              <Text className="text-theme-neutrals-300 text-sm font-semibold">
                No, I did not ask for this
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'done' && (
          <View className="items-center py-16">
            <Icon name="CircleCheck" size={44} color="#F4F4F5" />
            <Text className="text-white text-lg font-bold mt-4">Your TV is signed in</Text>
            <Text className="text-theme-neutrals-500 text-sm mt-2 text-center px-8">
              It should be showing your account already. Sign it out any time from
              Settings → Privacy → Active sessions.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
