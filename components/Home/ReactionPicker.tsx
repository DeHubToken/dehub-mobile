/**
 * Reaction Picker
 * ===============
 * The nine-reaction tray that opens when you hold the thumbs-up on a post.
 *
 * WHY IT ISN'T A MODAL
 * A Modal would take the touch responder away from the thumbs-up that is still
 * pressed, so the hold-and-lift gesture would need a second tap. This renders
 * in-place as an absolutely-positioned view above the action bar instead, and
 * the host clips nothing (`overflow: visible` up the chain) so the tray can
 * float over the card.
 *
 * The tray is dismissed by the host, which also owns `open` — see
 * FeedActionBar's `onReact` / `onPickerOpenChange` pair.
 *
 * WHY IT MEASURES ITSELF
 * Nine emoji plus padding is ~336pt wide — wider than the feed card it hangs
 * off, and ~381pt once the author's info button joins the row, which is wider
 * than a 360pt screen. Anchored to the thumbs-up alone (a card's fifth of seven
 * buttons) that ran the tray off the left edge and cut the first reactions off.
 * So it lays itself out invisibly once, measures where that put it in the
 * window, and only then paints — nudged back inside the screen, and scaled down
 * if it is too wide to fit at all. Every host gets this for free, wherever its
 * button happens to sit.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { View, Pressable, Text, useWindowDimensions, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import Icon from "../ui/Icon";
import { REACTION_LIST, type PostReaction } from "../../libs/reactions";

const TRAY_BG = "#0A0A0BE6";      // zinc-950 @ 90%
const TRAY_BORDER = "#FFFFFF1A";  // white @ 10%
const ACTIVE_BG = "#FFFFFF26";    // white @ 15%

/** How close to the edge of the screen the tray is allowed to sit. */
const EDGE_MARGIN = 8;

interface Placement {
  /** Horizontal nudge, in points, that pulls the tray back on screen. */
  dx: number;
  /** <1 only when the tray is wider than the screen it has to fit in. */
  scale: number;
  /** The width the figures were measured against — stale after a rotation. */
  screenWidth: number;
}

interface ReactionPickerProps {
  open: boolean;
  /** The reaction the viewer currently holds, highlighted in the tray. */
  current: PostReaction | null;
  onSelect: (reaction: PostReaction) => void;
  /** Which edge to anchor to — cards put the thumb at the far right. */
  align?: "left" | "right";
  /**
   * Opens the who-reacted-what breakdown. Passed only on your own posts — that
   * list belongs to the author, and the API refuses it to everyone else — so on
   * someone else's post the tray ends at the ninth emoji.
   */
  onShowInfo?: () => void;
}

const ReactionPickerComponent: React.FC<ReactionPickerProps> = ({
  open,
  current,
  onSelect,
  align = "right",
  onShowInfo,
}) => {
  const { width: screenWidth } = useWindowDimensions();
  const [placement, setPlacement] = useState<Placement | null>(null);
  const probeRef = useRef<View>(null);

  // Each opening measures afresh — the tray is only ever laid out while open,
  // and the host it belongs to may have moved since last time. The timer is a
  // safety net: if a measurement never lands, show the tray where it falls
  // rather than not at all.
  useEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    const fallback = setTimeout(() => {
      setPlacement((p) => (p?.screenWidth === screenWidth ? p : { dx: 0, scale: 1, screenWidth }));
    }, 250);
    return () => clearTimeout(fallback);
  }, [open, screenWidth]);

  const measure = useCallback(() => {
    probeRef.current?.measureInWindow((x, _y, width) => {
      if (!width) return;
      const scale = Math.min(1, (screenWidth - EDGE_MARGIN * 2) / width);
      // RN scales about a view's centre, so shrinking pulls both edges in.
      const scaledWidth = width * scale;
      const left = x + (width - scaledWidth) / 2;
      let dx = 0;
      if (left < EDGE_MARGIN) {
        dx = EDGE_MARGIN - left;
      } else if (left + scaledWidth > screenWidth - EDGE_MARGIN) {
        dx = screenWidth - EDGE_MARGIN - (left + scaledWidth);
      }
      setPlacement({ dx, scale, screenWidth });
    });
  }, [screenWidth]);

  if (!open) return null;

  // A rotation invalidates the measurement rather than just shifting it.
  const placed = placement?.screenWidth === screenWidth ? placement : null;

  const trayStyle: ViewStyle = {
    position: "absolute",
    bottom: "100%",
    marginBottom: 8,
    ...(align === "right" ? { right: 0 } : { left: 0 }),
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: TRAY_BG,
    borderWidth: 1,
    borderColor: TRAY_BORDER,
    // Android needs elevation to paint above sibling cards.
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    zIndex: 50,
  };

  const items = (
    <>
      {REACTION_LIST.map((reaction) => (
        <Pressable
          key={reaction.key}
          accessibilityRole="menuitem"
          accessibilityLabel={reaction.label}
          onPress={() => onSelect(reaction.key)}
          hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
          style={{
            width: 34,
            height: 34,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            backgroundColor: current === reaction.key ? ACTIVE_BG : "transparent",
          }}
        >
          <Text style={{ fontSize: 19, lineHeight: 24 }}>{reaction.emoji}</Text>
        </Pressable>
      ))}

      {/* Author-only breakdown of who reacted what. */}
      {onShowInfo && (
        <>
          <View
            style={{
              width: 1,
              height: 20,
              marginHorizontal: 3,
              backgroundColor: TRAY_BORDER,
            }}
          />
          <Pressable
            accessibilityRole="menuitem"
            accessibilityLabel="See who reacted"
            onPress={onShowInfo}
            hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
            style={{
              width: 34,
              height: 34,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
            }}
          >
            <Icon name="Info" size={18} color="#8B8D90" strokeWidth={1.9} />
          </Pressable>
        </>
      )}
    </>
  );

  // First pass: lay the tray out where it would naturally fall, invisibly, to
  // find out where on screen that is. Nothing is painted and nothing is
  // tappable until the second pass, so the tray is never seen in the wrong
  // place — it just arrives a frame later than the long press.
  if (!placed) {
    return (
      <View
        ref={probeRef}
        onLayout={measure}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[trayStyle, { opacity: 0 }]}
      >
        {items}
      </View>
    );
  }

  return (
    <Animated.View
      entering={FadeIn.duration(140)}
      exiting={FadeOut.duration(120)}
      accessibilityRole="menu"
      accessibilityLabel="Pick a reaction"
      style={[
        trayStyle,
        { transform: [{ translateX: placed.dx }, { scale: placed.scale }] },
      ]}
    >
      {items}
    </Animated.View>
  );
};

const ReactionPicker = memo(ReactionPickerComponent);
export default ReactionPicker;
