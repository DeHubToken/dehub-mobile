/**
 * Reaction Emoji
 * ==============
 * One reaction's glyph, drawn as the moving Noto emoji (the flame flickers,
 * the heart beats, the 💯 stamps) when `animate` is set, and as the plain
 * system emoji otherwise.
 *
 * The viewer's own reaction is the one that moves, so a 🔥 you cast reads
 * differently from a 🔥 somebody else put in the lead. Same files and same
 * rule as the web app.
 *
 * Google's Noto Animated Emoji (CC BY 4.0), cut to 72px animated WebP in
 * `assets/emoji/animated/`. expo-image plays animated WebP on both platforms.
 * Reduced-motion users, and any failed load, get the still emoji instead.
 */

import React, { memo, useState } from "react";
import { Text, type TextStyle } from "react-native";
import SmartImage from "../common/SmartImage";
import { useReducedMotion } from "react-native-reanimated";
import { reactionMeta, type PostReaction } from "../../libs/reactions";

const ANIMATED: Record<PostReaction, number> = {
  like: require("../../assets/emoji/animated/like.webp"),
  love: require("../../assets/emoji/animated/love.webp"),
  respect: require("../../assets/emoji/animated/respect.webp"),
  hot: require("../../assets/emoji/animated/hot.webp"),
  hundred: require("../../assets/emoji/animated/hundred.webp"),
  lol: require("../../assets/emoji/animated/lol.webp"),
  sad: require("../../assets/emoji/animated/sad.webp"),
  cry: require("../../assets/emoji/animated/cry.webp"),
  poo: require("../../assets/emoji/animated/poo.webp"),
  dislike: require("../../assets/emoji/animated/dislike.webp"),
};

interface ReactionEmojiProps {
  reaction: PostReaction;
  /** Play the moving version. Off, it is the ordinary emoji character. */
  animate?: boolean;
  /**
   * With animate on, whether it is moving right now. False holds the current
   * frame, for a card off screen, instead of swapping the art.
   */
  playing?: boolean;
  /** Box the emoji sits in, in pt. */
  size: number;
  /** Style for the still emoji, so it keeps the look its caller gave it. */
  textStyle?: TextStyle;
}

export const ReactionEmoji = memo(function ReactionEmoji({
  reaction,
  animate = false,
  playing = true,
  size,
  textStyle,
}: ReactionEmojiProps) {
  const reduceMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);

  if (!animate || reduceMotion || failed) {
    return <Text style={textStyle}>{reactionMeta(reaction).emoji}</Text>;
  }

  return (
    <SmartImage
      source={ANIMATED[reaction]}
      style={{ width: size, height: size }}
      contentFit="contain"
      autoplay={playing}
      accessible={false}
      onError={() => setFailed(true)}
    />
  );
});
