/**
 * The live viewer's bottom bar: say something, or do something.
 *
 * One row — a capsule input that takes the width, then a circle per action —
 * instead of the two rows this used to be (a chat input bar, and under it a
 * separate strip of five emoji cells plus like and share). Two stacked rows of
 * controls ate a third of the picture, and the reactions were the only place
 * in the app where an emoji was a button.
 *
 * The five reactions now live behind the one smile circle and open as a strip
 * above the bar, which is where a viewer's thumb already is.
 *
 * Chrome comes from components/common/ViewerChrome: zinc-900 fills, white
 * icons, no hue. The like fills white when it is on, exactly as the shorts
 * action row does.
 */
import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import type { ReactionType } from "../LiveProducer/ReactionOverlay";
import { formatCompactNumber } from "../../libs/numbers.util";
import { useKeyboard } from "../../hooks/useKeyboard";
import {
  ChromeFill,
  CHROME_GAP,
  CHROME_HIT_SLOP,
  CHROME_RADIUS,
  CHROME_SIZE,
  EDGE,
  TEXT_SHADOW,
} from "../common/ViewerChrome";

const REACTION_OPTIONS: { type: ReactionType; emoji: string }[] = [
  { type: "HEART", emoji: "❤️" },
  { type: "LIKE", emoji: "👍" },
  { type: "CELEBRATE", emoji: "🎉" },
  { type: "LAUGH", emoji: "😂" },
  { type: "SUPPORT", emoji: "✊" },
];

const COOLDOWN_MS = 400;

interface Props {
  /** Chat */
  canSend: boolean;
  chatEnabled: boolean;
  isLive: boolean;
  isEnded: boolean;
  isScheduled: boolean;
  onSendMessage: (content: string) => void;
  /** Actions */
  onReact: (type: ReactionType) => void;
  onLike: () => void;
  onShare: () => void;
  onGiftPress: () => void;
  likeCount: number;
  isLiked: boolean;
  actionsDisabled: boolean;
}

const LiveViewerActionBar: React.FC<Props> = ({
  canSend,
  chatEnabled,
  isLive,
  isEnded,
  isScheduled,
  onSendMessage,
  onReact,
  onLike,
  onShare,
  onGiftPress,
  likeCount,
  isLiked,
  actionsDisabled,
}) => {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const lastTapRef = useRef(0);
  const { height: keyboardHeight, isVisible: kbVisible } = useKeyboard();

  const inputDisabled = !canSend || !chatEnabled || isScheduled;

  // Carried over verbatim from the input bar this replaced. Untranslated
  // there, untranslated here — moving them behind fresh keys would have
  // been the same English in 109 locales with an i18n backlog entry on top.
  const placeholderText = isEnded
    ? "Stream ended"
    : isScheduled
      ? "Chat will open when live"
      : !isLive
        ? "Waiting for stream..."
        : !chatEnabled
          ? "Chat is disabled"
          : !canSend
            ? "Sign in to chat"
            : "Say something...";

  const handleSend = useCallback(() => {
    const content = message.trim();
    if (!content || inputDisabled) return;
    onSendMessage(content);
    setMessage("");
  }, [message, inputDisabled, onSendMessage]);

  const handleReact = useCallback(
    (type: ReactionType) => {
      const now = Date.now();
      if (now - lastTapRef.current < COOLDOWN_MS) return;
      lastTapRef.current = now;
      setReactionsOpen(false);
      onReact(type);
    },
    [onReact]
  );

  const openReactions = useCallback(() => setReactionsOpen(true), []);
  const closeReactions = useCallback(() => setReactionsOpen(false), []);

  const canSubmit = !!message.trim() && !inputDisabled;

  // The keyboard lifts the whole bar, reactions strip included, so an open
  // strip does not end up behind the keyboard it was opened above.
  //
  // iOS only. Android runs with `adjustResize` (app.json
  // softwareKeyboardLayoutMode), which shrinks the whole window by the
  // keyboard's height before this hook ever reports it — so adding the height
  // again lifted the bar a second time, clean off the top of the shrunken
  // screen. A viewer opening the keyboard on a phone watched the text box
  // vanish and typed blind.
  const lift = useMemo(
    () => (kbVisible && Platform.OS !== "android" ? keyboardHeight : 0),
    [kbVisible, keyboardHeight],
  );

  return (
    <View style={{ marginBottom: lift }} pointerEvents="box-none">
      {reactionsOpen && isLive ? (
        <Pressable style={styles.reactionStrip} onPress={closeReactions}>
          <ChromeFill />
          {REACTION_OPTIONS.map((opt) => (
            <Pressable
              key={opt.type}
              onPress={() => handleReact(opt.type)}
              disabled={actionsDisabled}
              accessibilityRole="button"
              /* The glyph is the label: a screen reader announces an emoji by its
                 own name, in the reader's language, which no key of ours would. */
              accessibilityLabel={opt.emoji}
              style={[styles.reactionCell, actionsDisabled ? styles.dim : null]}
            >
              <Text style={styles.glyph}>{opt.emoji}</Text>
            </Pressable>
          ))}
        </Pressable>
      ) : null}

      <View style={styles.row} pointerEvents="box-none">
        <View style={styles.inputWrap}>
          <ChromeFill />
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={placeholderText}
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={styles.input}
            editable={!inputDisabled}
            maxLength={500}
            multiline={false}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          {canSubmit ? (
            <Pressable
              onPress={handleSend}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("tip.send", { defaultValue: "Send" })}
              style={styles.sendButton}
            >
              <Icon name="Send" size={17} color="#fff" strokeWidth={1.8} />
            </Pressable>
          ) : null}
        </View>

        {/* Gift · share · thumb, on the composer's own row after the send
            button — the three things you do to a broadcast, where the thumb
            already is.

            They stand down while there is a message in the box: typing hands
            the whole row to the text and the send button, and the moment it
            is empty again they come back. Nothing is ever on this row that
            the viewer is not about to use. */}
        {canSubmit ? null : (
          <View style={styles.cluster} pointerEvents="box-none">
          {isLive ? (
            <Pressable
              onPress={onGiftPress}
              hitSlop={CHROME_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={t("postOptions.sendTip", { defaultValue: "Send Tip" })}
              style={styles.circle}
            >
              <ChromeFill />
              <Icon name="Gift" size={19} color="#fff" strokeWidth={1.8} />
            </Pressable>
          ) : null}

          <Pressable
            onPress={onShare}
            hitSlop={CHROME_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t("postOptions.share", { defaultValue: "Share" })}
            style={styles.circle}
          >
            <ChromeFill />
            <Icon name="Share2" size={19} color="#fff" strokeWidth={1.8} />
          </Pressable>

          <Pressable
            onPress={onLike}
            onLongPress={isLive ? openReactions : undefined}
            delayLongPress={400}
            disabled={!isLive}
            hitSlop={CHROME_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={isLiked ? "Unlike" : "Like"}
            style={[styles.circle, !isLive ? styles.dim : null]}
          >
            <ChromeFill />
            <Icon
              name="ThumbsUp"
              size={19}
              color="#fff"
              strokeWidth={1.8}
              fill={isLiked ? "#fff" : "none"}
            />
            {likeCount > 0 ? (
              <Text style={styles.badge} numberOfLines={1}>
                {formatCompactNumber(likeCount)}
              </Text>
            ) : null}
          </Pressable>
          </View>
        )}
      </View>
    </View>
  );
};


const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: EDGE,
    gap: 8,
  },
  cluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: CHROME_SIZE,
    borderRadius: CHROME_RADIUS,
    paddingLeft: 16,
    paddingRight: 6,
    gap: 4,
    overflow: "hidden",
  },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    paddingVertical: 0,
  },
  sendButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    width: CHROME_SIZE,
    height: CHROME_SIZE,
    borderRadius: CHROME_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  /**
   * The count rides the circle rather than sitting under it, so the row keeps
   * one height whether or not a stream has any likes yet.
   */
  badge: {
    position: "absolute",
    bottom: -3,
    color: "rgba(255,255,255,0.7)",
    fontSize: 10,
    fontWeight: "700",
    ...TEXT_SHADOW,
  },
  reactionStrip: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    height: CHROME_SIZE,
    borderRadius: CHROME_RADIUS,
    marginRight: EDGE,
    marginBottom: 8,
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  reactionCell: {
    width: 38,
    height: CHROME_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  dim: {
    opacity: 0.35,
  },
  glyph: {
    fontSize: 20,
    lineHeight: 26,
    textAlign: "center",
  },
});

export default memo(LiveViewerActionBar);
