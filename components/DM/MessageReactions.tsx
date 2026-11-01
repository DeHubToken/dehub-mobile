import React, { memo } from "react";
import { View, Text, TouchableOpacity } from "react-native";

/** Same quick-reaction row the web app offers in DMs. */
export const QUICK_DM_REACTIONS = ["👍", "❤️", "😂", "🔥", "🚀", "👀", "💯", "🙏", "🫡"] as const;

interface MessageReactionsProps {
  reactions?: Record<string, string[]>;
  isMine: boolean;
  /** Lowercased wallet address of the signed-in user. */
  myAddress: string;
  onToggle: (emoji: string) => void;
}

const MessageReactionsComponent: React.FC<MessageReactionsProps> = ({
  reactions,
  isMine,
  myAddress,
  onToggle,
}) => {
  const entries = Object.entries(reactions || {}).filter(([, who]) => who?.length);
  if (!entries.length) return null;

  return (
    <View
      className={`flex-row flex-wrap gap-1 px-4 -mt-0.5 mb-1 ${
        isMine ? "justify-end" : "justify-start"
      }`}
    >
      {entries.map(([emoji, who]) => {
        const mine = !!myAddress && who.some((a) => a.toLowerCase() === myAddress);
        return (
          <TouchableOpacity
            key={emoji}
            onPress={() => onToggle(emoji)}
            activeOpacity={0.7}
            hitSlop={4}
            className={`flex-row items-center rounded-full px-2 py-0.5 border ${
              mine ? "bg-white/[0.16] border-white/30" : "bg-white/[0.06] border-white/10"
            }`}
          >
            <Text className="text-[13px]">{emoji}</Text>
            {who.length > 1 && (
              <Text className="ml-1 text-[11px] text-theme-neutrals-200">{who.length}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export const MessageReactions = memo(MessageReactionsComponent);
export default MessageReactions;
