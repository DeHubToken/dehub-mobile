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
 *
 * The still emoji stays on screen until the moving file has drawn its first
 * frame, so switching to the animation never blinks to an empty box.
 */

import React, { memo, useEffect, useState } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
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

// 👍 and 👎 that play their move once, then rest, repeating every 5 seconds.
const EVERY_5S: Partial<Record<PostReaction, number>> = {
  like: require("../../assets/emoji/animated/like-every5s.webp"),
  dislike: require("../../assets/emoji/animated/dislike-every5s.webp"),
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
  /** Play the move once every 5 seconds instead of non-stop (👍 and 👎 only). */
  slow?: boolean;
  /** Box the emoji sits in, in pt. */
  size: number;
  /** Style for the still emoji, so it keeps the look its caller gave it. */
  textStyle?: TextStyle;
}

export const ReactionEmoji = memo(function ReactionEmoji({
  reaction,
  animate = false,
  playing = true,
  slow = false,
  size,
  textStyle,
}: ReactionEmojiProps) {
  const reduceMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [reaction]);

  if (!animate || reduceMotion || failed) {
    return <Text style={textStyle}>{reactionMeta(reaction).emoji}</Text>;
  }

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <SmartImage
        source={(slow && EVERY_5S[reaction]) || ANIMATED[reaction]}
        style={[StyleSheet.absoluteFill, { opacity: loaded ? 1 : 0 }]}
        contentFit="contain"
        autoplay={playing}
        accessible={false}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
      {!loaded && <Text style={textStyle}>{reactionMeta(reaction).emoji}</Text>}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
});
