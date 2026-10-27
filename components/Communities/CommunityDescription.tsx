import React, { memo } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { tokenizeDescription } from "../../libs/description-links";
import { openInApp } from "../../libs/links.utils";

interface CommunityDescriptionProps {
  text: string;
  className?: string;
  style?: StyleProp<TextStyle>;
  /** Cards and previews: one line, line breaks folded into spaces. */
  singleLine?: boolean;
}

/**
 * A community description with each link shown as a tappable 🔗, matching the
 * web. The 🔗 opens in the in-app browser (DeHub links open in place).
 */
const CommunityDescription: React.FC<CommunityDescriptionProps> = ({ text, className, style, singleLine = false }) => {
  const tokens = tokenizeDescription(text, singleLine);
  return (
    <Text className={className} style={style} numberOfLines={singleLine ? 1 : undefined}>
      {tokens.map((token, index) =>
        token.type === "link" ? (
          <Text
            key={`link-${index}`}
            onPress={() => void openInApp(token.url)}
            suppressHighlighting
            accessibilityRole="link"
            accessibilityLabel={token.value}
          >
            🔗
          </Text>
        ) : (
          <React.Fragment key={`text-${index}`}>{token.value}</React.Fragment>
        ),
      )}
    </Text>
  );
};

export default memo(CommunityDescription);
