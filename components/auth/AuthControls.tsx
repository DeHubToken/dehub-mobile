import React, { memo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * Shared chrome for every sign-in / wallet-setup surface.
 *
 * The auth flow had drifted into four competing button systems
 * (`bg-white/10 border-white/20` at 60pt, `bg-neutral-800 border-neutral-700`
 * at rounded-2xl, `bg-white/10 border-white/10` at py-3, and a solid
 * `bg-theme-accent`) plus five different corner radii, so consecutive steps of
 * one flow looked like three different apps. Worse, the accent fill is
 * #F4F4F5 — near white — and every button using it carried a `text-white`
 * label, a white icon and a `color="#fff"` spinner, i.e. white on white.
 *
 * Everything below mirrors dehubweb's LoginModal: white-glass secondary
 * buttons, a solid light primary with a near-black label, one radius, one
 * control height, and the black/white/zinc palette mandated by
 * dehubweb/src/index.css. Foreground colours are derived from the variant so a
 * label/icon/spinner can never be painted onto its own background again.
 */

export const AUTH_CONTROL_HEIGHT = 56;
export const AUTH_RADIUS = 12;
export const AUTH_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

export const authColors = {
  /** White-glass fill used by every secondary control. */
  surface: "rgba(255,255,255,0.10)",
  surfacePressed: "rgba(255,255,255,0.18)",
  border: "rgba(255,255,255,0.20)",
  /** Solid primary: theme accent + its paired foreground (never #fff). */
  primary: "#F4F4F5",
  primaryPressed: "#E4E4E7",
  onPrimary: "#09090B",
  /** Inputs sit a step below buttons so a field never reads as a button. */
  field: "rgba(255,255,255,0.06)",
  fieldBorder: "rgba(255,255,255,0.14)",
  label: "#FFFFFF",
  muted: "#A6A9AC",
  subtle: "#8B8D90",
  placeholder: "#8B8D90",
  hairline: "rgba(255,255,255,0.14)",
  danger: "#F87171",
} as const;

export const AUTH_DISABLED_OPACITY = 0.45;

export type AuthButtonVariant = "primary" | "secondary" | "ghost";

const VARIANT_FOREGROUND: Record<AuthButtonVariant, string> = {
  primary: authColors.onPrimary,
  secondary: authColors.label,
  ghost: authColors.label,
};

export interface AuthButtonProps {
  label: string;
  onPress: () => void;
  variant?: AuthButtonVariant;
  /** Ionicon name, tinted with the variant's foreground colour. */
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  /** Escape hatch for SVG glyphs (Google, Apple); receives the tint to use. */
  renderIcon?: (color: string, size: number) => React.ReactNode;
  /** Rendered at the trailing edge, e.g. a matched-account badge. */
  trailing?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  /** Left-align the label instead of centring it (list-style rows). */
  align?: "center" | "start";
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The one button of the auth flow. 56pt tall (comfortably past the 44pt iOS /
 * 48dp Android minimum), 12pt radius, 16pt label.
 */
export const AuthButton: React.FC<AuthButtonProps> = memo(
  ({
    label,
    onPress,
    variant = "secondary",
    icon,
    renderIcon,
    trailing,
    loading,
    disabled,
    align = "center",
    accessibilityLabel,
    accessibilityHint,
    style,
  }) => {
    const isDisabled = !!disabled || !!loading;
    const foreground = VARIANT_FOREGROUND[variant];

    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: !!loading }}
        style={({ pressed }) => [
          styles.button,
          align === "start" && styles.buttonStart,
          variant === "primary" && {
            backgroundColor: pressed ? authColors.primaryPressed : authColors.primary,
          },
          variant === "secondary" && {
            backgroundColor: pressed ? authColors.surfacePressed : authColors.surface,
            borderWidth: 1,
            borderColor: authColors.border,
          },
          variant === "ghost" && {
            backgroundColor: pressed ? authColors.surface : "transparent",
            borderWidth: 1,
            borderColor: authColors.border,
          },
          isDisabled && { opacity: AUTH_DISABLED_OPACITY },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={foreground} />
        ) : (
          <>
            {renderIcon
              ? renderIcon(foreground, 20)
              : icon && <Ionicons name={icon} size={20} color={foreground} />}
            <Text
              style={[
                styles.label,
                { color: foreground },
                variant === "primary" && styles.labelPrimary,
                align === "start" && styles.labelStart,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {trailing}
          </>
        )}
      </Pressable>
    );
  }
);
AuthButton.displayName = "AuthButton";

export interface AuthTextButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** `muted` for tertiary escapes, `default` for in-flow links. */
  tone?: "muted" | "default";
  align?: "center" | "start" | "end";
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Text-only action (Cancel, Resend, Back, "create one anyway"). Padded to a
 * 44pt target rather than relying on the glyph bounds, which is what the old
 * bare `<Text>` handlers did.
 */
export const AuthTextButton: React.FC<AuthTextButtonProps> = memo(
  ({ label, onPress, disabled, tone = "muted", align = "center", accessibilityLabel, style }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={AUTH_HIT_SLOP}
      style={({ pressed }) => [
        styles.textButton,
        align === "start" && { alignItems: "flex-start" },
        align === "end" && { alignItems: "flex-end" },
        (disabled || pressed) && { opacity: disabled ? AUTH_DISABLED_OPACITY : 0.6 },
        style,
      ]}
    >
      <Text
        style={[
          styles.textButtonLabel,
          { color: tone === "muted" ? authColors.muted : authColors.label },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
);
AuthTextButton.displayName = "AuthTextButton";

export interface AuthFieldProps extends TextInputProps {
  /** Leading Ionicon. */
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  /** Trailing slot — reveal toggle, submit affordance. */
  trailing?: React.ReactNode;
  label?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Text input matched to AuthButton's height, radius and palette. */
export const AuthField = React.forwardRef<TextInput, AuthFieldProps>(
  ({ icon, trailing, label, containerStyle, style, ...inputProps }, ref) => (
    <View style={containerStyle}>
      {!!label && <Text style={styles.fieldLabel}>{label}</Text>}
      <View style={styles.field}>
        {icon && (
          <Ionicons name={icon} size={20} color={authColors.label} style={styles.fieldIcon} />
        )}
        <TextInput
          ref={ref}
          placeholderTextColor={authColors.placeholder}
          accessibilityLabel={inputProps.accessibilityLabel ?? label ?? inputProps.placeholder}
          {...inputProps}
          style={[styles.fieldInput, style]}
        />
        {trailing}
      </View>
    </View>
  )
);
AuthField.displayName = "AuthField";

export interface AuthIconButtonProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  color?: string;
  size?: number;
}

/**
 * Compact icon action (reveal password, delete account). Padded to a 44pt
 * target — these were previously `pl-2 py-1` glyphs, roughly half that.
 */
export const AuthIconButton: React.FC<AuthIconButtonProps> = memo(
  ({ icon, onPress, accessibilityLabel, disabled, color = authColors.muted, size = 20 }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={AUTH_HIT_SLOP}
      style={({ pressed }) => [styles.iconButton, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  )
);
AuthIconButton.displayName = "AuthIconButton";

/** Rule with a centred caption ("or", "Accounts on this device"). */
export const AuthDivider: React.FC<{ label?: string; style?: StyleProp<ViewStyle> }> = memo(
  ({ label, style }) => (
    <View style={[styles.divider, style]}>
      <View style={styles.dividerRule} />
      {!!label && <Text style={styles.dividerLabel}>{label}</Text>}
      {!!label && <View style={styles.dividerRule} />}
    </View>
  )
);
AuthDivider.displayName = "AuthDivider";

/** Inline error panel — modals cover the root toast host, so errors render here. */
export const AuthErrorNotice: React.FC<{ message?: string | null; style?: StyleProp<ViewStyle> }> =
  memo(({ message, style }) =>
    message ? (
      <View style={[styles.errorNotice, style]} accessibilityLiveRegion="polite">
        <Ionicons name="alert-circle-outline" size={16} color={authColors.danger} />
        <Text style={styles.errorText}>{message}</Text>
      </View>
    ) : null
  );
AuthErrorNotice.displayName = "AuthErrorNotice";

export const authText = StyleSheet.create({
  title: { color: authColors.label, fontSize: 24, fontWeight: "700" },
  modalTitle: { color: authColors.label, fontSize: 20, fontWeight: "700" },
  body: { color: authColors.muted, fontSize: 14, lineHeight: 20 },
  caption: { color: authColors.subtle, fontSize: 12, lineHeight: 17 },
  emphasis: { color: authColors.label, fontWeight: "600" },
});

const styles = StyleSheet.create({
  button: {
    width: "100%",
    minHeight: AUTH_CONTROL_HEIGHT,
    borderRadius: AUTH_RADIUS,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonStart: {
    justifyContent: "flex-start",
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
  },
  labelPrimary: {
    fontWeight: "600",
  },
  labelStart: {
    flex: 1,
  },
  textButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  textButtonLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    minHeight: AUTH_CONTROL_HEIGHT,
    borderRadius: AUTH_RADIUS,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: authColors.field,
    borderWidth: 1,
    borderColor: authColors.fieldBorder,
  },
  fieldIcon: {
    marginRight: 10,
  },
  fieldInput: {
    flex: 1,
    fontSize: 16,
    color: authColors.label,
    paddingVertical: 0,
    backgroundColor: "transparent",
  },
  fieldLabel: {
    color: authColors.muted,
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 8,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 16,
  },
  dividerRule: {
    flex: 1,
    height: 1,
    backgroundColor: authColors.hairline,
  },
  dividerLabel: {
    color: authColors.subtle,
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  errorNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: AUTH_RADIUS,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.35)",
    backgroundColor: "rgba(248,113,113,0.10)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    flex: 1,
    color: authColors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
});
