/**
 * Page kit
 * ========
 * The app half of the web's page kit (dehubweb src/components/app/page-kit).
 * Every screen builds on these so pages match the home feed:
 *
 * - ScreenHeader  (components/ScreenHeader) is the floating title island.
 * - PageTabs      squared 10pt tab chips.
 * - PageSection   one block of content: a rounded card on the canvas themes,
 *                 full width between hairlines on System and minimal, like
 *                 the home feed's posts.
 * - PageEmpty     the standard empty / error / signed-out state.
 * - KitButton     the main call to action: white on System, the theme colour
 *                 on the canvas themes.
 */

import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE } from "../../theme/minimal";
import { themeIconUrl } from "../../theme/icons";

type Rgb = [number, number, number];

const HAIRLINE = "rgba(255,255,255,0.08)";
const BRIGHT_INK_THEMES = new Set<string>(["hazy", "swarms", "lavalamp", "island"]);

/** System and minimal draw pages flat and full width, like the home feed. */
export function useFlatPage(): boolean {
  const { theme, skin, isMinimal } = useAppTheme();
  return isMinimal || (theme === "system" && !skin);
}

function useKitColors() {
  const app = useAppTheme() as ReturnType<typeof useAppTheme> & { accent?: Rgb };
  const flat = useFlatPage();
  const accent = app.accent;
  const themed = !flat && !!accent;
  return {
    flat,
    isMinimal: app.isMinimal,
    hairline: app.isMinimal ? MINIMAL_HAIRLINE : HAIRLINE,
    chipBg: app.isMinimal ? "transparent" : "rgba(255,255,255,0.07)",
    chipInk: "rgba(255,255,255,0.72)",
    activeBg: themed ? `rgb(${accent![0]},${accent![1]},${accent![2]})` : "#FFFFFF",
    // The brighter accents (hazy, swarms, lavalamp, island) carry white ink, as on web.
    activeInk: themed && BRIGHT_INK_THEMES.has(app.theme) ? "#FFFFFF" : "#0B0B0C",
    card: app.colors?.card ?? "#18181B",
  };
}

/** A theme artwork key (theme/icons.ts), drawn in the active theme's style. */
export function ThemeIcon({ icon, size = 28, style }: { icon: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const { theme } = useAppTheme();
  const uri = themeIconUrl(theme, icon);
  if (!uri) return null;
  return <Image source={{ uri }} style={[{ width: size, height: size }, style as object]} contentFit="contain" cachePolicy="disk" />;
}

export interface PageTab<T extends string = string> {
  id: T;
  label: string;
  /** Theme artwork key or a node. */
  icon?: string | React.ReactNode;
  count?: number;
}

export function PageTabs<T extends string>({
  tabs,
  value,
  onChange,
  size = "md",
  style,
}: {
  tabs: PageTab<NoInfer<T>>[];
  value: T;
  onChange: (id: NoInfer<T>) => void;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
}) {
  const c = useKitColors();
  const height = size === "sm" ? 30 : 34;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.tabsRow, style as object]}
      accessibilityRole="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          // The fill sits on an inner view: the theme control paint
          // (libs/jsx/controls.js) repaints neutral fills on pressables.
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <View
              style={[
                styles.chip,
                {
                  height,
                  paddingHorizontal: size === "sm" ? 10 : 13,
                  backgroundColor: active ? c.activeBg : c.chipBg,
                  borderWidth: c.isMinimal && !active ? 1 : 0,
                  borderColor: c.hairline,
                },
              ]}
            >
              {typeof tab.icon === "string" ? <ThemeIcon icon={tab.icon} size={16} /> : tab.icon ?? null}
              <Text style={[styles.chipLabel, { fontSize: size === "sm" ? 12 : 13, color: active ? c.activeInk : c.chipInk }]}>
                {tab.label}
              </Text>
              {typeof tab.count === "number" ? (
                <Text style={[styles.chipLabel, { opacity: 0.6, fontSize: 12, color: active ? c.activeInk : c.chipInk }]}>{tab.count}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function PageSection({
  title,
  eyebrow,
  action,
  children,
  flush,
  style,
}: {
  title?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  /** No inner padding (lists that draw their own rows edge to edge). */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useKitColors();
  const frame: ViewStyle = c.flat
    ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline, paddingVertical: flush ? 0 : 18, paddingHorizontal: flush ? 0 : 16 }
    : { backgroundColor: c.card, borderRadius: 12, marginHorizontal: 8, marginBottom: 10, padding: flush ? 0 : 16, overflow: "hidden" };
  return (
    <View style={[frame, style as object]}>
      {title || eyebrow || action ? (
        <View style={[styles.sectionHead, flush && { paddingHorizontal: 16, paddingTop: 16 }]}>
          <View style={{ flexShrink: 1 }}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
            {title ? <Text numberOfLines={1} className="text-theme-neutrals-100" style={styles.sectionTitle}>{title}</Text> : null}
          </View>
          {action ?? null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function PageEmpty({
  icon,
  title,
  body,
  action,
}: {
  icon?: string | React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      {typeof icon === "string" ? <ThemeIcon icon={icon} size={56} style={{ marginBottom: 16 }} /> : icon ?? null}
      <Text className="text-theme-neutrals-100" style={styles.emptyTitle}>{title}</Text>
      {body ? <Text className="text-theme-neutrals-400" style={styles.emptyBody}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 20 }}>{action}</View> : null}
    </View>
  );
}

export function KitButton({
  label,
  onPress,
  variant = "primary",
  disabled,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "quiet";
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useKitColors();
  const primary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [{ opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, style as object]}
    >
      <View
        style={[
          styles.button,
          primary
            ? { backgroundColor: c.activeBg }
            : { backgroundColor: c.chipBg, borderWidth: 1, borderColor: c.hairline },
        ]}
      >
        {icon ?? null}
        <Text style={[styles.buttonLabel, { color: primary ? c.activeInk : "#FFFFFF" }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabsRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10 },
  chipLabel: { fontWeight: "600" },
  sectionHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  eyebrow: { fontSize: 10.5, fontWeight: "600", letterSpacing: 1.4, color: "rgba(255,255,255,0.45)" },
  sectionTitle: { fontSize: 15, fontWeight: "600" },
  empty: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 56 },
  emptyTitle: { fontSize: 15, fontWeight: "600", textAlign: "center" },
  emptyBody: { fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: "center", maxWidth: 300 },
  button: { height: 42, borderRadius: 10, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  buttonLabel: { fontSize: 14, fontWeight: "600" },
});

export { HAIRLINE as PAGE_HAIRLINE };
