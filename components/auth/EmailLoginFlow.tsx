import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, TextInput } from "react-native";
import { useTranslation } from "react-i18next";
import { AuthButton, AuthField, AuthTextButton } from "./AuthControls";

interface EmailLoginFlowProps {
  onSubmit: (provider: string, email?: string) => void;
  /**
   * Password sign-in. Optional so hosts that only wire the code flow keep
   * working — the password toggle simply isn't offered when it's absent.
   */
  onPasswordSubmit?: (email: string, password: string) => void;
  loading?: boolean;
  disabled?: boolean;
  /** See PhoneLoginFlow — lets the host screen scroll this clear of the keyboard. */
  onExpand?: (node: View | null) => void;
}

const EmailLoginFlow: React.FC<EmailLoginFlowProps> = ({
  onSubmit,
  onPasswordSubmit,
  loading,
  disabled,
  onExpand,
}) => {
  const { t } = useTranslation();
  const [showInput, setShowInput] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const inputRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const containerRef = useRef<View>(null);

  // Focus input when it appears
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  useEffect(() => {
    if (usePassword && passwordRef.current) {
      passwordRef.current.focus();
    }
  }, [usePassword]);

  const emailValid = !!email && email.includes("@");
  const isValid = usePassword ? emailValid && !!password : emailValid;

  const handleSubmit = () => {
    if (!isValid) return;
    if (usePassword && onPasswordSubmit) onPasswordSubmit(email, password);
    else onSubmit("email_passwordless", email);
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
        label={t("loginModal.continueEmail")}
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
        accessibilityLabel={t("loginModal.emailPlaceholder")}
        editable={!loading && !disabled}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        returnKeyType={usePassword ? "next" : "go"}
        onSubmitEditing={usePassword ? () => passwordRef.current?.focus() : handleSubmit}
      />
      {usePassword && (
        <AuthField
          ref={passwordRef}
          icon="lock-closed"
          onFocus={handleFocus}
          value={password}
          onChangeText={setPassword}
          placeholder={t("loginModal.password")}
          accessibilityLabel={t("loginModal.password")}
          editable={!loading && !disabled}
          secureTextEntry
          textContentType="password"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
        />
      )}
      <AuthButton
        variant="primary"
        label={usePassword ? t("loginModal.signIn") : t("loginModal.sendCode")}
        onPress={handleSubmit}
        disabled={!isValid || disabled}
        loading={loading}
        accessibilityLabel={
          usePassword ? t("loginModal.signIn") : t("loginModal.sendCode")
        }
      />
      {!!onPasswordSubmit && (
        <AuthTextButton
          tone="muted"
          label={
            usePassword
              ? t("loginModal.useCodeInstead")
              : t("loginModal.usePasswordInstead")
          }
          onPress={() => {
            setPassword("");
            setUsePassword((v) => !v);
          }}
          disabled={loading || disabled}
        />
      )}
    </View>
  );
};

export default EmailLoginFlow;
