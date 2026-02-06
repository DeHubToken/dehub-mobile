/**
 * FeedCaption - Instagram-style expandable caption with hashtag categories
 * 
 * Shows title, description (max 2 lines with "see more"), and clickable category hashtags.
 */
import React, { memo, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, NativeSyntheticEvent, TextLayoutEventData } from "react-native";

interface FeedCaptionProps {
  title?: string;
  description?: string;
  categories?: string[];
  onCategoryPress?: (category: string) => void;
  maxLines?: number;
  /** When true, shows full content without truncation */
  fullContent?: boolean;
  /** When true, shows category hashtags (default: true) */
  showCategories?: boolean;
}

const FeedCaptionComponent: React.FC<FeedCaptionProps> = ({
  title,
  description,
  categories,
  onCategoryPress,
  maxLines = 2,
  fullContent = false,
  showCategories = true,
}) => {
  const [expanded, setExpanded] = useState(fullContent);
  const [showSeeMore, setShowSeeMore] = useState(false);

  const handleTextLayout = useCallback((e: NativeSyntheticEvent<TextLayoutEventData>) => {
    // Don't show "see more" if fullContent is enabled
    if (fullContent) return;
    // Check if text was truncated (more lines than max)
    const { lines } = e.nativeEvent;
    if (!expanded && lines.length >= maxLines) {
      // Check if the last line was truncated
      const lastLine = lines[lines.length - 1];
      if (lastLine && lines.length === maxLines) {
        // Text might be truncated, show see more
        setShowSeeMore(true);
      }
    }
  }, [expanded, maxLines, fullContent]);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleCategoryPress = useCallback((cat: string) => {
    onCategoryPress?.(cat);
  }, [onCategoryPress]);

  // Build the caption text
  const hasTitle = !!title?.trim();
  const hasDescription = !!description?.trim();
  const hasCategories = showCategories && categories && categories.length > 0;

  // If no content, don't render
  if (!hasTitle && !hasDescription && !hasCategories) {
    return null;
  }

  return (
    <View className="mt-2">
      {/* Title */}
      {hasTitle && (
        <Text
          className="text-sm font-medium text-theme-neutrals-100"
          numberOfLines={fullContent ? undefined : 2}
          ellipsizeMode="tail"
        >
          {title}
        </Text>
      )}

      {/* Description with "see more" */}
      {hasDescription && (
        <View className="mt-1">
          <Text
            className="text-sm text-theme-neutrals-300"
            numberOfLines={fullContent || expanded ? undefined : maxLines}
            ellipsizeMode="tail"
            onTextLayout={handleTextLayout}
          >
            {description}
          </Text>
          {showSeeMore && !fullContent && (
            <TouchableOpacity onPress={toggleExpanded} activeOpacity={0.7}>
              <Text className="text-sm text-theme-neutrals-500 mt-0.5">
                {expanded ? "see less" : "see more"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Category hashtags */}
      {hasCategories && (
        <View className="flex-row flex-wrap mt-1">
          {categories!.map((cat, idx) => (
            <TouchableOpacity
              key={`cat-${idx}-${cat}`}
              onPress={() => handleCategoryPress(cat)}
              activeOpacity={0.7}
              className="mr-2"
            >
              <Text className="text-sm text-theme-neutrals-300">
                #{cat.toLowerCase().replace(/\s+/g, '')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

export const FeedCaption = memo(FeedCaptionComponent);
export default FeedCaption;
