import React, { memo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";

/** Same quick row the web DM, public and community chats use. */
export const DM_QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "🚀", "👀", "💯", "🙏", "🫡"] as const;

/** Height of the quick-reaction strip inside the long-press menu card. */
export const REACTION_STRIP_HEIGHT = 48;

export const hasReacted = (
  reactions: Record<string, string[]> | undefined,
  emoji: string,
  myAddress: string,
): boolean =>
  !!myAddress &&
  !!reactions?.[emoji]?.some((a) => a.toLowerCase() === myAddress.toLowerCase());

/** The emoji row at the top of a message's long-press menu. */
export const ReactionStrip: React.FC<{
  reactions?: Record<string, string[]>;
  myAddress: string;
  onPick: (emoji: string) => void;
}> = memo(({ reactions, myAddress, onPick }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    keyboardShouldPersistTaps="handled"
    style={{ height: REACTION_STRIP_HEIGHT }}
    contentContainerStyle={{ alignItems: "center", paddingHorizontal: 6 }}
  >
    {DM_QUICK_REACTIONS.map((emoji) => {
      const mine = hasReacted(reactions, emoji, myAddress);
      return (
        <Pressable
          key={emoji}
          onPress={() => onPick(emoji)}
          accessibilityRole="button"
          accessibilityLabel={emoji}
          accessibilityState={{ selected: mine }}
          hitSlop={4}
          className={`w-10 h-10 rounded-full items-center justify-center ${mine ? "bg-theme-neutrals-700" : ""}`}
        >
          <Text style={{ fontSize: 22 }}>{emoji}</Text>
        </Pressable>
      );
    })}
  </ScrollView>
));

/** Reaction chips under a bubble. Tapping one toggles your own. */
export const ReactionChips: React.FC<{
  reactions?: Record<string, string[]>;
  myAddress: string;
  isMine: boolean;
  onToggle: (emoji: string) => void;
}> = memo(({ reactions, myAddress, isMine, onToggle }) => {
  const entries = Object.entries(reactions || {}).filter(([, who]) => who?.length > 0);
  if (!entries.length) return null;
  return (
    <View
      className={`flex-row flex-wrap gap-1 px-3 -mt-0.5 mb-1 ${isMine ? "justify-end" : "justify-start ml-1"}`}
    >
      {entries.map(([emoji, who]) => {
        const mine = hasReacted(reactions, emoji, myAddress);
        return (
          <Pressable
            key={emoji}
            onPress={() => onToggle(emoji)}
            accessibilityRole="button"
            accessibilityLabel={`${emoji} ${who.length}`}
            accessibilityState={{ selected: mine }}
            hitSlop={4}
            className={`flex-row items-center rounded-full px-2 py-0.5 gap-1 border ${
              mine
                ? "bg-theme-neutrals-700 border-theme-neutrals-500"
                : "bg-theme-neutrals-800 border-theme-neutrals-700"
            }`}
          >
            <Text style={{ fontSize: 14 }}>{emoji}</Text>
            {who.length > 1 && (
              <Text className="text-[11px] text-theme-neutrals-300">{who.length}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
});
