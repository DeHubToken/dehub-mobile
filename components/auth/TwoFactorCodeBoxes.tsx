import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { authColors } from "./AuthControls";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Fires once the sixth digit lands. */
  onComplete?: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * Six boxes for an authenticator code, three, a dash, three — the same as the
 * website. One hidden field takes the typing (and the iOS / Android one-time
 * code autofill); the boxes only draw it. A wrong code shakes them.
 */
export default function TwoFactorCodeBoxes({ value, onChange, onComplete, invalid, disabled, autoFocus = true }: Props) {
  const { t } = useTranslation();
  const input = useRef<TextInput>(null);
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!invalid) return;
    shake.setValue(0);
    Animated.sequence(
      [8, -8, 6, -6, 3, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true })),
    ).start();
  }, [invalid, shake]);

  const handle = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 6);
    onChange(digits);
    if (digits.length === 6) onComplete?.(digits);
  };

  const box = (i: number) => {
    const active = !disabled && i === Math.min(value.length, 5);
    return (
      <View
        key={i}
        style={[
          styles.box,
          active && styles.boxActive,
          invalid && styles.boxInvalid,
        ]}
      >
        <Text style={styles.digit}>{value[i] ?? ""}</Text>
      </View>
    );
  };

  return (
    <Pressable onPress={() => input.current?.focus()} accessible={false}>
      <Animated.View style={[styles.row, { transform: [{ translateX: shake }] }]}>
        {[0, 1, 2].map(box)}
        <View style={styles.dash} />
        {[3, 4, 5].map(box)}
      </Animated.View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={handle}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        caretHidden
        accessibilityLabel={t("twoFactor.codeLabel", "Six-digit code")}
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  box: {
    width: 46,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: authColors.fieldBorder,
    backgroundColor: authColors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  boxActive: { borderColor: "rgba(255,255,255,0.6)" },
  boxInvalid: { borderColor: "#F87171" },
  digit: { color: authColors.label, fontSize: 24, fontWeight: "700" },
  dash: { width: 10, height: 2, borderRadius: 1, backgroundColor: authColors.subtle },
  // Off screen but focusable, so autofill and the keyboard still reach it.
  hidden: { position: "absolute", width: 1, height: 1, opacity: 0, left: -1000 },
});
