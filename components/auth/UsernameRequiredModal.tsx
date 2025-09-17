import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import GlassModal from '../ui/GlassModal';
import { AuthService } from '../../services/auth.service';
import { useDebounceCallback } from '../../hooks/useDebounceCallback';
import { toastError, toastSuccess } from '../../libs';
import { setAuthToken, setAuthUser } from '../../libs/auth.utils';
import { User } from '../../context/AuthContext';

interface Props {
  visible: boolean;
  provisionalUser: any; // includes authSignature
  onComplete: (finalUser: User) => void;
}

export const UsernameRequiredModal: React.FC<Props> = ({ visible, provisionalUser, onComplete }) => {
  const [username, setUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setUsername('');
      setAvailable(null);
      setChecking(false);
      setSubmitting(false);
    }
  }, [visible]);

  const runAvailability = useDebounceCallback(async (name: string) => {
    if (!name) { setAvailable(null); return; }
    setChecking(true);
    const res = await AuthService.checkUsernameAvailability(name);
    setAvailable(res.available);
    setChecking(false);
  }, 450);

  const handleChange = (text: string) => {
    setUsername(text);
    runAvailability(text.trim());
  };

  const disabled = !username.trim() || available === false || checking || submitting;

  const handleSubmit = async () => {
    if (disabled) return;
    setSubmitting(true);
    try {
  await AuthService.updateProfile({ username: username.trim() });
      const finalUser: User = { ...provisionalUser, username: username.trim() };
  // token already stored during initial sign in
      await setAuthUser(finalUser);
      toastSuccess('Username set');
      onComplete(finalUser);
    } catch (e: any) {
      toastError(e, 'Failed to set username');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassModal visible={visible} onClose={() => {}} presentation="center" blurIntensity={50}>
      <View className="items-center justify-center px-6 py-6">
        <View className="w-full rounded-xl p-6 bg-transparent">
          <Text className="text-white text-xl font-semibold mb-4">Choose a username</Text>
          <Text className="text-neutral-400 text-sm mb-4">Set a username to continue. You can change it later.</Text>
          <TextInput
            value={username}
            onChangeText={handleChange}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Username"
            placeholderTextColor="#666"
            className="border border-neutral-700 rounded-md px-4 py-3 text-white"
          />
          <View className="mt-2 min-h-[32px]">
            {checking && (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color="#888" />
                <Text className="text-xs text-neutral-400 ml-2">Checking availability…</Text>
              </View>
            )}
            {!checking && available === true && username.length > 0 && (
                <View>
                <View className="flex-row items-center mb-1">
                   <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                  <Text className="text-xs text-green-400 font-medium">Username is available</Text>
                </View>
                <Text className="text-[10px] text-neutral-500">You can use this username.</Text>
              </View>
            )}
            {!checking && available === false && username.length > 0 && (
              <View>
                <View className="flex-row items-center mb-1">
                  <View className="w-2 h-2 rounded-full bg-red-500 mr-2" />
                  <Text className="text-xs text-red-400 font-medium">Username taken</Text>
                </View>
                <Text className="text-[10px] text-neutral-500">Try adding numbers or an underscore.</Text>
              </View>
            )}
            {available === null && !checking && username.length === 0 && (
              <Text className="text-[10px] text-neutral-500">3-30 chars: letters, numbers, underscore.</Text>
            )}
          </View>
          <TouchableOpacity
            disabled={disabled}
            onPress={handleSubmit}
            className={`mt-4 py-3 rounded-md items-center ${disabled ? 'bg-neutral-700' : 'bg-theme-accent'}`}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">Continue</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
};
