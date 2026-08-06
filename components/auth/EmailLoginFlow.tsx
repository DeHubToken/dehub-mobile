import React, { useState, useRef, useEffect } from "react";
import { View, TextInput } from "react-native";
import { AuthButton, AuthField } from "./AuthControls";

interface EmailLoginFlowProps {
  onSubmit: (provider: string, email?: string) => void;
  loading?: boolean;
  disabled?: boolean;
}

const EmailLoginFlow: React.FC<EmailLoginFlowProps> = ({
  onSubmit,
  loading,
  disabled,
}) => {
  const [showInput, setShowInput] = useState(false);
  const [email, setEmail] = useState("");
  const inputRef = useRef<TextInput>(null);

  // Focus input when it appears
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  const isValid = !!email && email.includes("@");

  const handleSubmit = () => {
    if (isValid) onSubmit("email_passwordless", email);
  };

  if (!showInput) {
    return (
      <AuthButton
        icon="mail"
        label="Continue with Email"
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
        icon="mail"
        value={email}
        onChangeText={setEmail}
        placeholder="user@example.com"
        accessibilityLabel="Email address"
        editable={!loading && !disabled}
        keyboardType="email-address"
        textContentType="emailAddress"
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
        accessibilityLabel="Send sign-in code to this email"
      />
    </View>
  );
};

export default EmailLoginFlow;
