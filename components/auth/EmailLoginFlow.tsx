import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, TextInput } from "react-native";
import { AuthButton, AuthField } from "./AuthControls";

interface EmailLoginFlowProps {
  onSubmit: (provider: string, email?: string) => void;
  loading?: boolean;
  disabled?: boolean;
  /** See PhoneLoginFlow — lets the host screen scroll this clear of the keyboard. */
  onExpand?: (node: View | null) => void;
}

const EmailLoginFlow: React.FC<EmailLoginFlowProps> = ({
  onSubmit,
  loading,
  disabled,
  onExpand,
}) => {
  const [showInput, setShowInput] = useState(false);
  const [email, setEmail] = useState("");
  const inputRef = useRef<TextInput>(null);
  const containerRef = useRef<View>(null);

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

  // On focus rather than on layout — see PhoneLoginFlow for why.
  const handleFocus = useCallback(() => {
    onExpand?.(containerRef.current);
  }, [onExpand]);

  useEffect(() => () => onExpand?.(null), [onExpand]);

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
    <View ref={containerRef} style={{ gap: 12 }}>
      <AuthField
        ref={inputRef}
        icon="mail"
        onFocus={handleFocus}
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
