import React, { useState, useRef, useEffect } from "react";
import { View, TextInput } from "react-native";
import { AuthButton, AuthField } from "./AuthControls";

// Mirrors dehubweb's LoginModal phone validation — E.164 format
// ("+" country code, 7-15 digits total).
const E164_PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

interface PhoneLoginFlowProps {
  onSubmit: (phone: string) => void;
  loading?: boolean;
  disabled?: boolean;
}

const PhoneLoginFlow: React.FC<PhoneLoginFlowProps> = ({
  onSubmit,
  loading,
  disabled,
}) => {
  const [showInput, setShowInput] = useState(false);
  const [phone, setPhone] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  const isValid = E164_PHONE_REGEX.test(phone.trim());

  const handleSubmit = () => {
    if (isValid) onSubmit(phone.trim());
  };

  if (!showInput) {
    return (
      <AuthButton
        icon="call"
        label="Continue with Phone"
        onPress={() => setShowInput(true)}
        disabled={disabled}
        loading={loading}
      />
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <AuthField
        ref={inputRef}
        icon="call"
        value={phone}
        onChangeText={setPhone}
        placeholder="+1 415 555 2671"
        accessibilityLabel="Phone number with country code"
        editable={!loading && !disabled}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />
      <AuthButton
        variant="primary"
        label="Send code"
        onPress={handleSubmit}
        disabled={!isValid || disabled}
        loading={loading}
        accessibilityLabel="Send sign-in code to this phone number"
      />
    </View>
  );
};

export default PhoneLoginFlow;
