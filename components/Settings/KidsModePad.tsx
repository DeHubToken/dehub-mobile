/**
 * The Kids Mode PIN pad — mirrors web's `KidsModeDrawer`.
 *
 * One sheet, two jobs: set a PIN to arm Kids Mode, or enter it to leave. Arming
 * asks twice, because a PIN nobody can reproduce locks the device until the
 * parent finds their wallet — recoverable, but not on the tablet the child is
 * holding.
 *
 * A keypad rather than a TextInput, deliberately. A PIN is digits, the OS
 * keyboard is the wrong shape for them, and a focused input in a sheet a child
 * is sitting in front of is selectable and pasteable.
 *
 * @module components/Settings/KidsModePad
 */
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import GlassModal from '../ui/GlassModal';
import Icon from '../ui/Icon';

const PIN_MIN = 4;
const PIN_MAX = 8;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

interface KidsModePadProps {
  visible: boolean;
  onClose: () => void;
  /** 'enable' sets a new PIN (asked twice); 'disable' checks the existing one. */
  mode: 'enable' | 'disable';
  /** Resolves on success; reject with an Error whose message is shown under the pad. */
  onSubmit: (pin: string) => Promise<unknown>;
  busy?: boolean;
}

const KidsModePad: React.FC<KidsModePadProps> = ({ visible, onClose, mode, onSubmit, busy }) => {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [stage, setStage] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState<string | null>(null);

  // Reset every time it opens. A half-typed PIN surviving a close is the kind
  // of state that submits something nobody meant to submit.
  useEffect(() => {
    if (!visible) return;
    setPin('');
    setFirstPin('');
    setStage('enter');
    setError(null);
  }, [visible]);

  const press = (digit: string) => {
    setError(null);
    setPin(current => (current.length >= PIN_MAX ? current : current + digit));
  };

  const submit = async () => {
    if (pin.length < PIN_MIN) return;

    if (mode === 'enable' && stage === 'enter') {
      setFirstPin(pin);
      setPin('');
      setStage('confirm');
      return;
    }

    if (mode === 'enable' && pin !== firstPin) {
      setError(t('settings.kidsModePinMismatch', 'Those PINs are different. Start again.'));
      setPin('');
      setFirstPin('');
      setStage('enter');
      return;
    }

    try {
      await onSubmit(pin);
      onClose();
    } catch (err: any) {
      // The server's own message, which says whether the PIN was wrong or the
      // pad is locked — two different things the parent needs to tell apart.
      setError(err?.message || t('settings.kidsModeFailed', 'That did not work. Try again.'));
      setPin('');
    }
  };

  const title =
    mode === 'disable'
      ? t('settings.kidsModeEnterPin', 'Enter your PIN')
      : stage === 'confirm'
        ? t('settings.kidsModeConfirmPin', 'Enter it again')
        : t('settings.kidsModeSetPin', 'Choose a PIN');

  const help =
    mode === 'disable'
      ? t('settings.kidsModeEnterPinHelp', 'This turns Kids Mode off on this device.')
      : stage === 'confirm'
        ? t('settings.kidsModeConfirmPinHelp', 'So you know you can reproduce it.')
        : t('settings.kidsModeSetPinHelp', '4 to 8 digits. You need it to turn Kids Mode off again.');

  const action =
    mode === 'disable'
      ? t('settings.kidsModeTurnOff', 'Turn Kids Mode off')
      : stage === 'confirm'
        ? t('settings.kidsModeTurnOn', 'Turn Kids Mode on')
        : t('common.continue', 'Continue');

  return (
    <GlassModal visible={visible} onClose={onClose} presentation="center" maxHeight="80%" blurIntensity={30}>
      <View className="p-5">
        <Text className="text-white text-lg font-bold text-center mb-1">{title}</Text>
        <Text className="text-theme-neutrals-400 text-sm text-center mb-4">{help}</Text>

        {/* Filled dots to PIN_MIN, then dimmer ones for the optional digits, so
            the pad shows both "long enough yet" and "how much room is left". */}
        <View className="flex-row items-center justify-center mb-4">
          {Array.from({ length: PIN_MAX }).map((_, i) => (
            <View
              key={i}
              className={
                'w-2.5 h-2.5 rounded-full mx-1.5 ' +
                (i < pin.length
                  ? 'bg-white'
                  : i < PIN_MIN
                    ? 'bg-theme-neutrals-600'
                    : 'bg-theme-neutrals-800')
              }
            />
          ))}
        </View>

        {error ? (
          <Text className="text-red-400 text-sm text-center mb-3">{error}</Text>
        ) : null}

        <View className="flex-row flex-wrap justify-center mb-3">
          {KEYS.map(digit => (
            <TouchableOpacity
              key={digit}
              onPress={() => press(digit)}
              activeOpacity={0.7}
              className="w-[30%] h-14 m-1 rounded-xl bg-theme-neutrals-800 items-center justify-center"
            >
              <Text className="text-white text-xl font-medium">{digit}</Text>
            </TouchableOpacity>
          ))}
          <View className="w-[30%] h-14 m-1" />
          <TouchableOpacity
            onPress={() => press('0')}
            activeOpacity={0.7}
            className="w-[30%] h-14 m-1 rounded-xl bg-theme-neutrals-800 items-center justify-center"
          >
            <Text className="text-white text-xl font-medium">0</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setError(null);
              setPin(current => current.slice(0, -1));
            }}
            activeOpacity={0.7}
            className="w-[30%] h-14 m-1 rounded-xl bg-theme-neutrals-800 items-center justify-center"
          >
            <Icon name="Delete" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={submit}
          disabled={pin.length < PIN_MIN || busy}
          activeOpacity={0.7}
          className={
            'px-4 py-3 rounded-xl bg-white ' + (pin.length < PIN_MIN || busy ? 'opacity-40' : '')
          }
        >
          <Text className="text-black text-center font-semibold">{action}</Text>
        </TouchableOpacity>

        {mode === 'disable' ? (
          <Text className="text-theme-neutrals-500 text-xs text-center mt-3">
            {t(
              'settings.kidsModeForgotPin',
              'Forgotten it? Sign in with your wallet on another device to turn Kids Mode off.',
            )}
          </Text>
        ) : null}
      </View>
    </GlassModal>
  );
};

export default KidsModePad;
