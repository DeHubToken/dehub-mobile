import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlassModal from '../ui/GlassModal';
import { AuthButton, AuthField, authColors, authText } from './AuthControls';
import { AuthService } from '../../services/auth.service';
import { useDebounceCallback } from '../../hooks/useDebounceCallback';
import { toastError, toastSuccess } from '../../libs';
import { setAuthToken, setAuthUser } from '../../libs/auth.utils';
import { User } from '../../context/AuthContext';

const statusRow: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 6 };

interface Props {
  visible: boolean;
  provisionalUser: any; // includes authSignature
  onComplete: (finalUser: User) => void;
}

export const UsernameRequiredModal: React.FC<Props> = ({ visible, provisionalUser, onComplete }) => {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setUsername('');
      setDisplayName('');
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

  const handleDisplayNameChange = (text: string) => {
    setDisplayName(text);
  };

  const isDisplayNameValid = displayName.trim().length >= 2 && displayName.trim().length <= 50;
  const disabled = !username.trim() || available === false || checking || submitting || !isDisplayNameValid;

  const handleSubmit = async () => {
    if (disabled) return;
    setSubmitting(true);
    try {
      await AuthService.updateProfile({ username: username.trim(), displayName: displayName.trim() });
      const finalUser: User = { ...provisionalUser, username: username.trim(), displayName: displayName.trim() };
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
      <View style={{ padding: 24 }}>
        <Text style={authText.modalTitle}>Set your profile</Text>
        <Text style={[authText.body, { marginTop: 8, marginBottom: 20 }]}>
          Choose a username and display name to continue. You can change them later.
        </Text>
        {/* Uncontrolled: passing `value` back causes char duplication on Android
            when re-renders (BlurView) lag behind fast typing */}
        <AuthField
          defaultValue={username}
          onChangeText={handleChange}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Username"
          accessibilityLabel="Username"
        />
        <View style={{ marginTop: 8, minHeight: 32 }}>
          {checking && (
            <View style={statusRow}>
              <ActivityIndicator size="small" color={authColors.subtle} />
              <Text style={authText.caption}>Checking availability…</Text>
            </View>
          )}
          {!checking && available === true && username.length > 0 && (
            <View style={statusRow}>
              <Ionicons name="checkmark-circle" size={14} color={authColors.label} />
              <Text style={[authText.caption, { color: authColors.label }]}>
                Username is available
              </Text>
            </View>
          )}
          {!checking && available === false && username.length > 0 && (
            <View style={statusRow}>
              <Ionicons name="close-circle" size={14} color={authColors.danger} />
              <Text style={[authText.caption, { color: authColors.danger }]}>
                Username taken — try adding numbers or an underscore
              </Text>
            </View>
          )}
          {available === null && !checking && username.length === 0 && (
            <Text style={authText.caption}>3-30 chars: letters, numbers, underscore.</Text>
          )}
        </View>

        <AuthField
          defaultValue={displayName}
          onChangeText={handleDisplayNameChange}
          autoCapitalize="words"
          autoCorrect={false}
          placeholder="Display name"
          accessibilityLabel="Display name"
          containerStyle={{ marginTop: 16 }}
        />
        <View style={{ marginTop: 8, minHeight: 20 }}>
          {!isDisplayNameValid && displayName.length > 0 && (
            <Text style={[authText.caption, { color: authColors.danger }]}>
              Display name must be 2-50 characters.
            </Text>
          )}
          {displayName.length === 0 && (
            <Text style={authText.caption}>Your public name shown on your profile.</Text>
          )}
        </View>

        <AuthButton
          variant="primary"
          label="Continue"
          onPress={handleSubmit}
          disabled={disabled}
          loading={submitting}
          style={{ marginTop: 16 }}
        />
      </View>
    </GlassModal>
  );
};
