import React, { memo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

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
/**
 * Compact height for standalone CTAs (the sign-in gate), mirroring web's `h-10`
 * Button. Rounded up from web's 40px to the 44pt iOS / 48dp Android tap floor,
 * which a bare 40 would sit under.
 */
export const AUTH_COMPACT_HEIGHT = 44;
export const AUTH_RADIUS = 12;
export const AUTH_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

/**
 * dehubweb's `Button variant="glass"` — `from-white/20 via-white/10 to-white/5`
 * on a `to-br` axis with a `white/30` hairline. `backdrop-blur-xl` is dropped
 * deliberately: these sit on the app's flat black, so a BlurView would cost a
 * render target to blur nothing.
 */
export const AUTH_GLASS_COLORS = [
  "rgba(255,255,255,0.20)",
  "rgba(255,255,255,0.10)",
  "rgba(255,255,255,0.05)",
] as const;

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

export type AuthButtonVariant = "primary" | "secondary" | "ghost" | "glass";

const VARIANT_FOREGROUND: Record<AuthButtonVariant, string> = {
  primary: authColors.onPrimary,
  secondary: authColors.label,
  ghost: authColors.label,
  glass: authColors.label,
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
  /**
   * `full` is the 56pt full-width bar every step of the sign-in flow uses.
   * `compact` is web's standalone pill — 44pt, hugging its label at a 120pt
   * floor — for a CTA that stands on its own rather than in a stack.
   */
  size?: "full" | "compact";
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
    size = "full",
    accessibilityLabel,
    accessibilityHint,
    style,
  }) => {
    const isDisabled = !!disabled || !!loading;
    const foreground = VARIANT_FOREGROUND[variant];

    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: isDisabled, busy: !!loading }}
        style={[
          styles.button,
          size === "compact" && styles.buttonCompact,
          align === "start" && styles.buttonStart,
          variant === "primary" && { backgroundColor: authColors.primary },
          variant === "secondary" && {
            backgroundColor: authColors.surface,
            borderWidth: 1,
            borderColor: authColors.border,
          },
          variant === "ghost" && {
            backgroundColor: "transparent",
            borderWidth: 1,
            borderColor: authColors.border,
          },
          variant === "glass" && styles.buttonGlass,
          isDisabled && { opacity: AUTH_DISABLED_OPACITY },
          style,
        ]}
      >
        {variant === "glass" && (
          <>
            <LinearGradient
              colors={AUTH_GLASS_COLORS}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.glassHighlight} pointerEvents="none" />
          </>
        )}
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
                (variant === "primary" || variant === "glass") && styles.labelPrimary,
                align === "start" && styles.labelStart,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {trailing}
          </>
        )}
      </TouchableOpacity>
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
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={AUTH_HIT_SLOP}
      style={[
        styles.textButton,
        align === "start" && { alignItems: "flex-start" },
        align === "end" && { alignItems: "flex-end" },
        disabled && { opacity: AUTH_DISABLED_OPACITY },
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
    </TouchableOpacity>
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
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={AUTH_HIT_SLOP}
      style={[styles.iconButton, disabled && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </TouchableOpacity>
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
  /** Web's `text-xl font-semibold` on the sign-in gate — 20/600, not 20/700. */
  gateTitle: { color: authColors.label, fontSize: 20, fontWeight: "600" },
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
  buttonCompact: {
    width: "auto",
    alignSelf: "center",
    minWidth: 120,
    minHeight: AUTH_COMPACT_HEIGHT,
    paddingHorizontal: 24,
  },
  buttonGlass: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
    // The gradient fill is an absolutely-positioned child, so it has to be
    // clipped to the radius rather than painted by the container. Web's
    // `0_8px_32px_rgba(0,0,0,0.2)` drop shadow is not reproduced: iOS clips a
    // shadow on any view with `overflow: hidden`, and a black shadow on this
    // screen's black ground reads as nothing either way. The inset top
    // highlight below is the half of that shadow stack that actually shows.
    overflow: "hidden",
  },
  glassHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.40)",
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
