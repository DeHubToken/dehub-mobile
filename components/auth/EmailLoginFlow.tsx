import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '../../hooks/useSurfaceDraft';
import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, TextInput } from "react-native";
import { useTranslation } from "react-i18next";
import { AuthButton, AuthField, AuthErrorNotice } from "./AuthControls";

interface EmailLoginFlowProps {
  onSubmit: (provider: string, email?: string) => void;
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
  loading,
  disabled,
  onExpand,
  startOpen,
}) => {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const [showInput, setShowInput] = useState(!!startOpen);
  const [emailError, setEmailError] = useState("");
  const [email, setEmail] = useSurfaceDraft("components/auth/EmailLoginFlow.tsx:email", "");
  const inputRef = useRef<TextInput>(null);
  const containerRef = useRef<View>(null);

  // Focus input when it appears (not when it was open from the start)
  useEffect(() => {
    if (showInput && !startOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput, startOpen]);

  const handleSubmit = () => {
    if (disabled || loading) return;
    const value = email.trim();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError(value
        ? t("loginModal.invalidEmail", "Please enter a valid email address")
        : t("loginModal.emailPlaceholder", "Please enter your email address"));
      inputRef.current?.focus();
      onExpand?.(containerRef.current);
      return;
    }
    setEmailError("");
    onSubmit("email_passwordless", value);
  };

  // On focus rather than on layout — see PhoneLoginFlow for why.
  const handleFocus = useCallback(() => {
    onExpand?.(containerRef.current);
  }, [onExpand]);

  useEffect(() => () => onExpand?.(null), [onExpand]);

  if (!showInput) {
    return (
      <AuthButton
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
        onFocus={handleFocus}
        value={email}
        onChangeText={(value) => { setEmail(value); if (emailError) setEmailError(""); }}
        placeholder={_copy("copy.b4c9a289323b", { defaultValue: "user@example.com" })}
        accessibilityLabel={t("loginModal.emailPlaceholder")}
        editable={!loading && !disabled}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={!startOpen}
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
        style={{ textAlign: "center" }}
      />
      {emailError ? <AuthErrorNotice message={emailError} /> : null}
      <AuthButton
        variant="primary"
        label={startOpen ? t("loginModal.continueEmail") : t("loginModal.sendCode")}
        onPress={handleSubmit}
        disabled={disabled}
        loading={loading}
        accessibilityLabel={
          t("loginModal.sendCode")
        }
      />
    </View>
  );
};

export default EmailLoginFlow;
