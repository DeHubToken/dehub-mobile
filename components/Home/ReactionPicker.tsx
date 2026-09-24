/**
 * Reaction Picker
 * ===============
 * The reaction tray that opens when you hold the thumbs-up on a post.
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
 * WHY IT MEASURES ITSELF AND SCROLLS
 * Nine emoji plus padding is ~336pt wide — wider than the feed card it hangs
 * off, and ~381pt once the author's info button joins the row, which is wider
 * than a 360pt screen. Anchored to the thumbs-up alone (a card's fifth of seven
 * buttons) that ran the tray off the left edge and cut the first reactions off.
 * So it lays itself out invisibly once, measures where that put it in the
 * window, and only then paints: nudged back inside the screen, and no wider
 * than the screen, with the row of emoji scrolling sideways for whatever that
 * cuts off. It used to shrink the whole tray to fit instead, which made every
 * emoji smaller on exactly the narrow phones where they were already hardest
 * to hit. Every host gets this for free, wherever its button happens to sit.
 *
 * The invisible pass has to be a plain row, not the scroller: a horizontal
 * ScrollView lays its children out on an unbounded axis, so it can report no
 * natural width of its own and there would be nothing to measure.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import Icon from "../ui/Icon";
import {
  NEGATIVE_REACTION_LIST,
  POSITIVE_REACTION_LIST,
  type PostReaction,
} from "../../libs/reactions";

const TRAY_BG = "#0A0A0BE6";      // zinc-950 @ 90%
const TRAY_BORDER = "#FFFFFF1A";  // white @ 10%
const ACTIVE_BG = "#FFFFFF26";    // white @ 15%

/** How close to the edge of the screen the tray is allowed to sit. */
const EDGE_MARGIN = 8;

/** The tray's own padding and border, either side of the row it holds. */
const TRAY_INSET = 6 * 2 + 1 * 2;

interface Placement {
  /** Horizontal nudge, in points, that pulls the tray back on screen. */
  dx: number;
  /**
   * How wide the scrolling row is allowed to be. Below its natural width only
   * when the tray would otherwise be wider than the screen. Always a number:
   * a horizontal ScrollView with no width of its own collapses inside a tray
   * that is sized by its content, so the fallback path hands it the widest the
   * screen allows rather than nothing.
   */
  rowWidth: number;
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
   * someone else's post the tray ends at the last emoji.
   */
  onShowInfo?: () => void;
  /**
   * Which thumb this tray hangs off. The positive one wears the seven faces
   * that count as a like; the negative one wears the downvote — see the note
   * on POSITIVE_REACTION_LIST for why they are not one tray.
   */
  polarity?: "positive" | "negative";
}

const ReactionPickerComponent: React.FC<ReactionPickerProps> = ({
  open,
  current,
  onSelect,
  align = "right",
  onShowInfo,
  polarity = "positive",
}) => {
  const { t } = useTranslation();
  const reactions = polarity === "negative" ? NEGATIVE_REACTION_LIST : POSITIVE_REACTION_LIST;
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
      setPlacement((p) =>
        p?.screenWidth === screenWidth
          ? p
          : { dx: 0, rowWidth: screenWidth - EDGE_MARGIN * 2 - TRAY_INSET, screenWidth },
      );
    }, 250);
    return () => clearTimeout(fallback);
  }, [open, screenWidth]);

  const measure = useCallback(() => {
    probeRef.current?.measureInWindow((x, _y, width) => {
      if (!width) return;
      // `width` is the row at its natural size. Cap the tray at the screen and
      // hand the row whatever is left inside it; anything over that scrolls.
      const maxTray = screenWidth - EDGE_MARGIN * 2;
      const trayWidth = Math.min(width, maxTray);
      const rowWidth = trayWidth - TRAY_INSET;
      // Capping pulls in the edge the tray is not anchored to, so a right-hung
      // tray keeps its right edge and gains on the left.
      const left = align === "right" ? x + (width - trayWidth) : x;
      let dx = 0;
      if (left < EDGE_MARGIN) {
        dx = EDGE_MARGIN - left;
      } else if (left + trayWidth > screenWidth - EDGE_MARGIN) {
        dx = screenWidth - EDGE_MARGIN - (left + trayWidth);
      }
      setPlacement({ dx, rowWidth, screenWidth });
    });
  }, [align, screenWidth]);

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
    borderRadius: 16,
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
      {reactions.map((reaction) => (
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
            borderRadius: 12,
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
            accessibilityLabel={t("feedCard.seeWhoReacted")}
            onPress={onShowInfo}
            hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
            style={{
              width: 34,
              height: 34,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
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
      accessibilityLabel={polarity === "negative" ? "Pick a downvote reaction" : "Pick a reaction"}
      style={[trayStyle, { transform: [{ translateX: placed.dx }] }]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        style={{ width: placed.rowWidth }}
        contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 2 }}
      >
        {items}
      </ScrollView>
    </Animated.View>
  );
};

const ReactionPicker = memo(ReactionPickerComponent);
export default ReactionPicker;
