import React from "react";
import { I18nManager, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import Reanimated from "react-native-reanimated";
import Icon from "../ui/Icon";
import { useAppTheme } from "../../context/ThemeContext";
import { LIGHT_PILL_SHADOW } from "../ui/FrostedPill";
import { FEED_PILL_RADIUS, FeedPillBrackets, FeedPillSurface } from "../ui/FeedPillSurface";
import { PageHeaderContext } from "./PageHeaderContext";
import { usePillGlide } from "./pillGlide";

/** Same insets as the home feed's pill (FeedNavBar). */
const SIDE_INSET = 8;
const TOP_INSET = 8;
/** The home pill's row: a 16pt icon in 10pt of padding top and bottom. */
const ROW_HEIGHT = 38;
const LEAD_SLOT_WIDTH = 40;

/** Actions sit in the pill as plain icons, like the home pill's buttons. */
const PILL_ACTION = {
  backgroundColor: "transparent",
  borderWidth: 0,
  width: 34,
  height: 34,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
} as const;

/**
 * Pages hand the header their own square buttons. Inside the pill the squares
 * lose their fill so they read as the pill's own buttons (web's IslandAction
 * does the same). Anything without a press handler is drawn as the page made it.
 */
function asPillActions(node: React.ReactNode): React.ReactNode {
  return React.Children.map(node, (child) => {
    if (!React.isValidElement(child)) return child;
    const el = child as React.ReactElement<any>;
    if (el.type === React.Fragment || el.type === View) {
      return React.cloneElement(el, undefined, asPillActions(el.props.children));
    }
    // Any button the page made (a touchable with onPress): keep its press,
    // drop its square fill. Styling wrappers can change the element type, so
    // match on the press handler rather than on TouchableOpacity itself.
    if (typeof el.props.onPress === "function") {
      const style = el.props.style;
      return React.cloneElement(el, {
        className: undefined,
        style: typeof style === "function"
          ? (state: unknown) => [style(state), PILL_ACTION]
          : [style, PILL_ACTION],
      });
    }
    return el;
  });
}

export interface PillHeaderProps {
  title: string;
  subtitle?: string;
  showBack: boolean;
  onBack: () => void;
  backLabel: string;
  iconUrl?: string;
  leftContent?: React.ReactNode;
  titleAccessory?: React.ReactNode;
  titleBadge?: React.ReactNode;
  rightContent?: React.ReactNode;
  tabs?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * A page's header on phones: the home feed's top pill, with the page's own
 * contents inside. The lead slot holds the back arrow or the page's icon; the
 * page's tabs (or its title, when it has none) fill the middle; actions sit at
 * the end. Search and filter rows sit under the pill.
 */
export default function PillHeader({
  title,
  subtitle,
  showBack,
  onBack,
  backLabel,
  iconUrl,
  leftContent,
  titleAccessory,
  titleBadge,
  rightContent,
  tabs,
  children,
}: PillHeaderProps) {
  const { skin, isLight } = useAppTheme();
  const { ref, pillStyle, contentStyle } = usePillGlide();
  // Titles stay white like web's pill; only the icons take the theme's tint.
  const ink = "#FFFFFF";
  const softInk = skin ? skin.tabIcon : "#A1A1AA";

  return (
    <Reanimated.View ref={ref as any} style={[styles.wrap, pillStyle]}>
      <View
        style={[
          styles.pill,
          skin ? { borderRadius: Number(skin.strip.borderRadius ?? FEED_PILL_RADIUS) } : isLight ? LIGHT_PILL_SHADOW : null,
        ]}
      >
        <FeedPillSurface />
        <FeedPillBrackets />
        <PageHeaderContext.Provider value>
          <Reanimated.View style={[styles.row, contentStyle]}>
            {showBack ? (
              <TouchableOpacity
                onPress={onBack}
                style={styles.lead}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={backLabel}
              >
                <View style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
                  <Icon name="ArrowLeft" size={16} color={softInk} strokeWidth={1.8} />
                </View>
              </TouchableOpacity>
            ) : iconUrl ? (
              <View style={styles.lead}>
                <Image source={{ uri: iconUrl }} style={styles.icon} contentFit="contain" cachePolicy="disk" />
              </View>
            ) : (
              <View style={styles.leadGap} />
            )}
            {leftContent ? <View style={styles.leftContent}>{leftContent}</View> : null}
            {tabs ? (
              <View style={styles.tabs} accessibilityLabel={title}>
                {tabs}
              </View>
            ) : (
              <View style={styles.titleBox}>
                <View style={styles.titleLine}>
                  <Text numberOfLines={1} accessibilityRole="header" style={[styles.title, { color: ink }]}>
                    {title}
                  </Text>
                  {titleBadge ?? null}
                  {titleAccessory ? <View style={{ marginLeft: 8 }}>{titleAccessory}</View> : null}
                </View>
                {subtitle ? (
                  <Text numberOfLines={1} style={[styles.subtitle, { color: softInk }]}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            )}
            {rightContent ? <View style={styles.actions}>{asPillActions(rightContent)}</View> : null}
          </Reanimated.View>
        </PageHeaderContext.Provider>
      </View>
      {children ? (
        <PageHeaderContext.Provider value>
          <View style={styles.extra}>{children}</View>
        </PageHeaderContext.Provider>
      ) : null}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SIDE_INSET, paddingTop: TOP_INSET, paddingBottom: 6, zIndex: 20 },
  pill: { borderRadius: FEED_PILL_RADIUS, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", minHeight: ROW_HEIGHT },
  lead: { width: LEAD_SLOT_WIDTH, height: ROW_HEIGHT, alignItems: "center", justifyContent: "center" },
  leadGap: { width: 12 },
  icon: { width: 24, height: 24 },
  leftContent: { marginRight: 8 },
  tabs: { flex: 1, minWidth: 0 },
  titleBox: { flex: 1, minWidth: 0, paddingRight: 8 },
  titleLine: { flexDirection: "row", alignItems: "center" },
  title: { flexShrink: 1, fontSize: 15, fontWeight: "600", letterSpacing: 0.1 },
  subtitle: { fontSize: 11, marginTop: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 2, paddingRight: 2, marginLeft: 4 },
  extra: { marginTop: 8 },
});
