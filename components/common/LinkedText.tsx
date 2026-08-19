import React, { memo, useCallback } from "react";
import { Text } from "react-native";
import { tokenizeChatText } from "../../libs/chat-links";
import { openExternalLink } from "../../libs/links.utils";

interface LinkedTextProps {
  /** The message text. */
  text?: string | null;
  /** Classes for the paragraph — the caller keeps control of size and colour. */
  className?: string;
  /**
   * Forwarded to every link run. A link swallows the touch that would otherwise
   * reach the bubble underneath it, so without this a long press that happens
   * to land on a link silently does nothing instead of opening the message menu.
   */
  onLongPress?: () => void;
}

/**
 * A message paragraph with its links made tappable.
 *
 * The link text stays on screen rather than collapsing to an icon: in a
 * conversation the URL is what the sender wrote, and hiding it leaves the
 * reader nothing to judge before opening it and nothing to copy. There is no
 * hover on a phone, so a tooltip is not a substitute.
 */
const LinkedText: React.FC<LinkedTextProps> = ({ text, className, onLongPress }) => {
  const handlePress = useCallback((url: string) => {
    void openExternalLink(url);
  }, []);

  const tokens = tokenizeChatText(text);

  return (
    <Text className={className}>
      {tokens.map((token, index) =>
        token.type === "link" ? (
          <Text
            key={`link-${index}`}
            className="underline"
            onPress={() => handlePress(token.url)}
            onLongPress={onLongPress}
            suppressHighlighting
          >
            {token.value}
          </Text>
        ) : (
          token.value
        ),
      )}
    </Text>
  );
};

export default memo(LinkedText);
