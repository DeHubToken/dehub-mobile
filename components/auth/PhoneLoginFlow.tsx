import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { AuthButton, AuthField, authColors, authText } from "./AuthControls";
import {
  isValidNationalDigits,
  phoneEntryHint,
  toE164,
  toNationalDigits,
} from "../../libs/phone-number";

interface PhoneLoginFlowProps {
  onSubmit: (phone: string) => void;
  loading?: boolean;
  disabled?: boolean;
  /**
   * Called with this row's view once it has expanded, so the host screen can
   * scroll it clear of the keyboard. The field is the fourth row of the
   * provider stack with three more sections under it, so on most handsets it
   * opens underneath the keyboard that its own autoFocus just raised.
   */
  onExpand?: (node: View | null) => void;
}

const PhoneLoginFlow: React.FC<PhoneLoginFlowProps> = ({
  onSubmit,
  loading,
  disabled,
  onExpand,
}) => {
  const [showInput, setShowInput] = useState(false);
  // Digits only — the "+" is painted by the field, never typed. The raw text is
  // kept alongside them because the hint needs it: a pasted national number
  // reduces to digits that are perfectly valid for some other country, and only
  // the separators-without-a-"+" shape in the raw text gives that away.
  const [digits, setDigits] = useState("");
  const [raw, setRaw] = useState("");
  const inputRef = useRef<TextInput>(null);
  const containerRef = useRef<View>(null);

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  const isValid = isValidNationalDigits(digits);
  const hint = phoneEntryHint(raw, digits);

  const handleChange = useCallback((text: string) => {
    setRaw(text);
    setDigits(toNationalDigits(text));
  }, []);

  const handleSubmit = useCallback(() => {
    if (isValid) onSubmit(toE164(digits));
  }, [isValid, digits, onSubmit]);

  // Registered on FOCUS, not on layout. onLayout fires on every layout pass an
  // open row sees — including every keyboard show/hide, since the host's
  // KeyboardAvoidingView resizes the ScrollView — so registering there let an
  // already-open phone row keep stealing the scroll target back from whichever
  // field the caret was actually in.
  const handleFocus = useCallback(() => {
    onExpand?.(containerRef.current);
  }, [onExpand]);

  // Unregister so a keyboard raised by something else (an unrelated modal over
  // the sign-in list) doesn't re-measure and scroll this row underneath it.
  useEffect(() => () => onExpand?.(null), [onExpand]);

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
    <View ref={containerRef} style={{ gap: 12 }}>
      <AuthField
        ref={inputRef}
        icon="call"
        onFocus={handleFocus}
        value={digits}
        onChangeText={handleChange}
        placeholder="1 415 555 2671"
        accessibilityLabel="Phone number, country code first"
        accessibilityHint="Enter your number starting with the country code. The plus sign is added for you."
        editable={!loading && !disabled}
        // `inputMode` is the prop the New Architecture actually reads;
        // `keyboardType` is kept for the old renderer and for iOS, where
        // "phone-pad" is the only one of the two that suppresses the letter
        // keys. Between them the field raises a dial pad on every target.
        inputMode="tel"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        // Deliberately NO maxLength. It is enforced natively against the RAW
        // text before onChangeText ever runs, so a 15-cap would clip an
        // autofilled "+1 (415) 555-2671" down to "+1 (415) 555-26" and hand us
        // a shorter number that still passes validation. The digit ceiling is
        // enforced by isValidNationalDigits instead, where over-length FAILS
        // rather than being trimmed into somebody else's number.
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
        // The "+" reads as part of the value rather than as decoration: same
        // colour and size as the digits, immediately ahead of the caret. It is
        // unselectable, so it cannot be backspaced away and cannot be doubled
        // by a paste that already carries one.
        prefix={<Text style={styles.prefix}>+</Text>}
        style={styles.input}
      />
      {!!hint && (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {hint}
        </Text>
      )}
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

const styles = StyleSheet.create({
  input: {
    // Matches AuthField's own 16pt input text, so the "+" prefix and the
    // digits sit on one baseline.
    fontSize: 16,
  },
  prefix: {
    fontSize: 16,
    color: authColors.label,
    marginRight: 2,
  },
  hint: {
    color: authColors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: -4,
  },
});

export default PhoneLoginFlow;
