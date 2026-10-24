import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
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
  /**
   * Render the field already open (the email-first sign-in layout). It does
   * not grab focus on mount, so the keyboard stays down until the person taps.
   */
  startOpen?: boolean;
}

const EmailLoginFlow: React.FC<EmailLoginFlowProps> = ({
  onSubmit,
  onPasswordSubmit,
  loading,
  disabled,
  onExpand,
  startOpen,
}) => {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const [showInput, setShowInput] = useState(!!startOpen);
  const [usePassword, setUsePassword] = useState(false);
  const [email, setEmail] = useSurfaceDraft("components/auth/EmailLoginFlow.tsx:email", "");
  const [password, setPassword] = useState("");
  const inputRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const containerRef = useRef<View>(null);

  // Focus input when it appears (not when it was open from the start)
  useEffect(() => {
    if (showInput && !startOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput, startOpen]);

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
        icon="mail-outline"
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
        icon="mail-outline"
        onFocus={handleFocus}
        value={email}
        onChangeText={setEmail}
        placeholder={_copy("copy.b4c9a289323b", { defaultValue: "user@example.com" })}
        accessibilityLabel={t("loginModal.emailPlaceholder")}
        editable={!loading && !disabled}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={!startOpen}
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
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
        />
      )}
      <AuthButton
        variant="primary"
        label={usePassword ? t("loginModal.signIn") : startOpen ? t("loginModal.continueEmail") : t("loginModal.sendCode")}
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
