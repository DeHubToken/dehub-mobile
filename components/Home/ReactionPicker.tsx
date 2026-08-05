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
 */

import React, { memo } from "react";
import { View, Pressable, Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import Icon from "../ui/Icon";
import { REACTION_LIST, type PostReaction } from "../../libs/reactions";

const TRAY_BG = "#0A0A0BE6";      // zinc-950 @ 90%
const TRAY_BORDER = "#FFFFFF1A";  // white @ 10%
const ACTIVE_BG = "#FFFFFF26";    // white @ 15%

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
  if (!open) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(140)}
      exiting={FadeOut.duration(120)}
      accessibilityRole="menu"
      accessibilityLabel="Pick a reaction"
      style={{
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
      }}
    >
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
    </Animated.View>
  );
};

const ReactionPicker = memo(ReactionPickerComponent);
export default ReactionPicker;
