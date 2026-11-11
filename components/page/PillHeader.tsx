import React, { createContext, useEffect, useRef, useState } from "react";
import { I18nManager, StyleSheet, Text, TouchableOpacity, View, type TextInput } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import Reanimated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
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

/** How far the drawer runs up behind the pill. The slot starts this far up,
 *  so the drawer's top edge and corners hide behind the pill's rounded bottom. */
const DRAWER_TUCK = 24;
/** Home's new-posts drawer pull (web: spring 420 / 32 / 0.8). */
const DRAWER_SPRING = { stiffness: 420, damping: 36, mass: 0.8 } as const;

/** True while a page's search drawer is out, so a field inside can take focus. */
export const PillDrawerContext = createContext(false);

/** Focuses the field when the pill's search drawer comes out. */
export function useFocusOnPillDrawer(ref: React.RefObject<TextInput | null>) {
  const open = React.useContext(PillDrawerContext);
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => ref.current?.focus(), 120);
    return () => clearTimeout(id);
  }, [open, ref]);
}

/** Drop inside a drawer's children to focus its search field on opening. */
export function PillDrawerAutoFocus({ inputRef }: { inputRef: React.RefObject<TextInput | null> }) {
  useFocusOnPillDrawer(inputRef);
  return null;
}

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
  /** The pill's one line, in place of the tabs or title (Explore's search). */
  pillLine?: React.ReactNode;
  /** The page opens and shuts the drawer itself; no search button is added. */
  drawerOpen?: boolean;
  /** Search and filters. They wait behind a search button in the pill and
   *  slide out as a full-width drawer attached under it. */
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
  pillLine,
  drawerOpen: drawerOpenProp,
  children,
}: PillHeaderProps) {
  const { t } = useTranslation();
  const { skin, isLight } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const controlled = drawerOpenProp !== undefined;
  const [drawerOpenState, setDrawerOpen] = useState(false);
  const drawerOpen = controlled ? !!drawerOpenProp : drawerOpenState;
  // The drawer's contents are built on its first opening, then kept, so a
  // typed search survives closing it.
  const [built, setBuilt] = useState(drawerOpen);
  if (drawerOpen && !built) setBuilt(true);
  const hasDrawer = !!children;
  const showSearchButton = hasDrawer && !controlled;

  const drawerHeight = useSharedValue(0);
  const drawerProgress = useSharedValue(drawerOpen ? 1 : 0);
  const firstRun = useRef(true);
  useEffect(() => {
    const to = drawerOpen ? 1 : 0;
    if (firstRun.current || reducedMotion) {
      firstRun.current = false;
      drawerProgress.value = to;
      return;
    }
    drawerProgress.value = drawerOpen ? withSpring(1, DRAWER_SPRING) : withTiming(0, { duration: 200 });
  }, [drawerOpen, reducedMotion, drawerProgress]);
  const slotStyle = useAnimatedStyle(() => ({
    height: DRAWER_TUCK + Math.max(0, drawerProgress.value) * drawerHeight.value,
  }));
  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (Math.min(1, drawerProgress.value) - 1) * (drawerHeight.value + DRAWER_TUCK) }],
  }));
  const { ref, pillStyle, contentStyle } = usePillGlide();
  // Titles stay white like web's pill; only the icons take the theme's tint.
  const ink = "#FFFFFF";
  const softInk = skin ? skin.tabIcon : "#A1A1AA";
  const corner = skin ? Number(skin.strip.borderRadius ?? FEED_PILL_RADIUS) : FEED_PILL_RADIUS;

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
            {pillLine ? (
              <View style={styles.line} accessibilityLabel={title}>
                {pillLine}
              </View>
            ) : tabs ? (
              <View style={styles.tabs} accessibilityLabel={title}>
                {tabs}
              </View>
            ) : (
              <View style={styles.titleBox}>
                {/* One line only: a page's subtitle is read out, not drawn. */}
                <View style={styles.titleLine} accessibilityHint={subtitle || undefined}>
                  <Text numberOfLines={1} accessibilityRole="header" style={[styles.title, { color: ink }]}>
                    {title}
                  </Text>
                  {titleBadge ?? null}
                  {titleAccessory ? <View style={{ marginLeft: 8 }}>{titleAccessory}</View> : null}
                </View>
              </View>
            )}
            {rightContent || showSearchButton ? (
              <View style={styles.actions}>
                {rightContent ? asPillActions(rightContent) : null}
                {showSearchButton ? (
                  <TouchableOpacity
                    testID="pill-search-button"
                    onPress={() => setDrawerOpen((open) => !open)}
                    style={PILL_ACTION}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={drawerOpen ? t("search.close", "Close search") : t("search.open", "Search")}
                    accessibilityState={{ expanded: drawerOpen }}
                  >
                    <Icon name={drawerOpen ? "X" : "Search"} size={16} color={drawerOpen ? ink : softInk} strokeWidth={1.8} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </Reanimated.View>
        </PageHeaderContext.Provider>
      </View>
      {hasDrawer ? (
        // The search pulls out from under the pill as one full-width drawer in
        // the pill's material, like Home's new-posts drawer. The slot starts
        // DRAWER_TUCK up behind the pill, so its clip line is hidden under it.
        <Reanimated.View
          testID="pill-search-drawer"
          style={[styles.drawerSlot, slotStyle]}
          pointerEvents={drawerOpen ? "box-none" : "none"}
          accessibilityElementsHidden={!drawerOpen}
          importantForAccessibility={drawerOpen ? "auto" : "no-hide-descendants"}
        >
          <Reanimated.View
            style={[styles.drawer, drawerStyle]}
            onLayout={(e) => { drawerHeight.value = e.nativeEvent.layout.height; }}
          >
            <View pointerEvents="none" style={[styles.drawerMaterial, { borderBottomLeftRadius: corner, borderBottomRightRadius: corner }]}>
              <FeedPillSurface />
              <LinearGradient
                colors={isLight && !skin ? ["rgba(0,0,0,0.10)", "rgba(0,0,0,0)"] : ["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]}
                style={styles.drawerShade}
              />
            </View>
            {built ? (
              <PageHeaderContext.Provider value>
                <PillDrawerContext.Provider value={drawerOpen}>
                  <View style={styles.drawerBody}>{children}</View>
                </PillDrawerContext.Provider>
              </PageHeaderContext.Provider>
            ) : null}
          </Reanimated.View>
        </Reanimated.View>
      ) : null}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SIDE_INSET, paddingTop: TOP_INSET, paddingBottom: 6, zIndex: 20 },
  pill: { borderRadius: FEED_PILL_RADIUS, overflow: "hidden", zIndex: 1 },
  row: { flexDirection: "row", alignItems: "center", minHeight: ROW_HEIGHT },
  lead: { width: LEAD_SLOT_WIDTH, height: ROW_HEIGHT, alignItems: "center", justifyContent: "center" },
  leadGap: { width: 12 },
  icon: { width: 24, height: 24 },
  leftContent: { marginRight: 8 },
  tabs: { flex: 1, minWidth: 0 },
  titleBox: { flex: 1, minWidth: 0, paddingRight: 8 },
  titleLine: { flexDirection: "row", alignItems: "center" },
  title: { flexShrink: 1, fontSize: 15, fontWeight: "600", letterSpacing: 0.1 },
  line: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  actions: { flexDirection: "row", alignItems: "center", gap: 2, paddingRight: 2, marginLeft: 4 },
  drawerSlot: { overflow: "hidden", marginTop: -DRAWER_TUCK },
  drawer: { position: "absolute", left: 0, right: 0, top: DRAWER_TUCK },
  drawerMaterial: { position: "absolute", left: 0, right: 0, bottom: 0, top: -DRAWER_TUCK, overflow: "hidden" },
  drawerShade: { position: "absolute", left: 0, right: 0, top: DRAWER_TUCK, height: 14 },
  drawerBody: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8, gap: 8 },
});
