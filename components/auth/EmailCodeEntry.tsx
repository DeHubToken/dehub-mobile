import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput } from "react-native";
import { AuthButton, AuthField, AuthTextButton, authText } from "./AuthControls";

interface EmailCodeEntryProps {
  email: string;
  onSubmit: (code: string) => void;
  onBack: () => void;
  onResend: () => void;
  loading?: boolean;
  disabled?: boolean;
}

const EmailCodeEntry: React.FC<EmailCodeEntryProps> = ({
  email,
  onSubmit,
  onBack,
  onResend,
  loading,
  disabled,
}) => {
  const [code, setCode] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const canSubmit = code.trim().length >= 6 && !loading && !disabled;

  const handleSubmit = () => {
    if (canSubmit) onSubmit(code.trim());
  };

  return (
    <View style={{ width: "100%", gap: 12 }}>
      <Text style={[authText.body, { textAlign: "center" }]}>
        Enter the code sent to{"\n"}
        <Text style={authText.emphasis}>{email}</Text>
      </Text>

      <AuthField
        ref={inputRef}
        icon="key"
        value={code}
        onChangeText={setCode}
        placeholder="6-digit code"
        accessibilityLabel="Verification code"
        editable={!loading && !disabled}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
        style={{ letterSpacing: 4 }}
      />

      <AuthButton
        variant="primary"
        label="Verify"
        onPress={handleSubmit}
        disabled={code.trim().length < 6 || disabled}
        loading={loading}
      />

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <AuthTextButton label="Back" onPress={onBack} disabled={loading} align="start" />
        <AuthTextButton
          label="Resend code"
          onPress={onResend}
          disabled={loading}
          tone="default"
          align="end"
        />
      </View>
    </View>
  );
};

export default EmailCodeEntry;
