/**
 * FeedCaption - Instagram-style expandable caption with hashtag categories
 * 
 * Shows title, description (max 2 lines with "see more"), and clickable category hashtags.
 * Detects URLs in text and renders them as blue, tappable links opened in-app.
 */
import React, { memo, useState, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, NativeSyntheticEvent, TextLayoutEventData } from "react-native";
import { openInApp } from "../../libs/links.utils";
import { hasValidTLD } from "../../libs/tlds";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";

type Segment =
  | { type: "text"; value: string }
  | { type: "link"; value: string; url: string }
  | { type: "mention"; value: string; username: string };

const ensureUrl = (raw: string): string => {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const parseTextToSegments = (input: string): Segment[] => {
  if (!input) return [];
  // Match @mentions or URLs
  const combinedRegex = /(@[\w.]+)|\b((?:https?:\/\/|www\.)[^\s]+)/gi;
  const matches = Array.from(input.matchAll(combinedRegex));
  if (matches.length === 0) return [{ type: "text", value: input }];

  const segments: Segment[] = [];
  let cursor = 0;

  for (const m of matches) {
    const index = m.index ?? 0;
    if (index > cursor) {
      segments.push({ type: "text", value: input.slice(cursor, index) });
    }

    if (m[1]) {
      // @mention match
      const username = m[1].slice(1);
      segments.push({ type: "mention", value: m[1], username });
      cursor = index + m[0].length;
    } else {
      // URL match
      let value = m[0];
      let trailing = "";
      while (value.length > 0 && /[\]\)\}.,!?;:]+$/.test(value)) {
        trailing = value.slice(-1) + trailing;
        value = value.slice(0, -1);
      }
      const url = ensureUrl(value);
      if (url && hasValidTLD(value)) {
        segments.push({ type: "link", value, url });
      } else {
        segments.push({ type: "text", value });
      }
      if (trailing) segments.push({ type: "text", value: trailing });
      cursor = index + m[0].length;
    }
  }
  if (cursor < input.length) {
    segments.push({ type: "text", value: input.slice(cursor) });
  }
  return segments;
};

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
  const { showUserProfile } = useUserProfileSheet();

  const handleTextLayout = useCallback((e: NativeSyntheticEvent<TextLayoutEventData>) => {
    if (fullContent) return;
    const { lines } = e.nativeEvent;
    if (!expanded && lines.length >= maxLines) {
      const lastLine = lines[lines.length - 1];
      if (lastLine && lines.length === maxLines) {
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

  const handleOpenLink = useCallback((url: string) => {
    openInApp(url);
  }, []);

  const handleMentionPress = useCallback((username: string) => {
    showUserProfile(username);
  }, [showUserProfile]);

  // Parse links in title & description
  const titleSegments = useMemo(() => parseTextToSegments(title || ""), [title]);
  const descSegments = useMemo(() => parseTextToSegments(description || ""), [description]);

  const renderSegments = useCallback(
    (segments: Segment[], keyPrefix: string) =>
      segments.map((seg, idx) => {
        if (seg.type === "link") {
          return (
            <Text
              key={`${keyPrefix}-${idx}`}
              className="text-blue-400"
              onPress={() => handleOpenLink(seg.url)}
              suppressHighlighting
            >
              {seg.value}
            </Text>
          );
        }
        if (seg.type === "mention") {
          return (
            <Text
              key={`${keyPrefix}-m-${idx}`}
              className="font-bold"
              onPress={() => handleMentionPress(seg.username)}
              suppressHighlighting
            >
              {seg.value}
            </Text>
          );
        }
        return <Text key={`${keyPrefix}-${idx}`}>{seg.value}</Text>;
      }),
    [handleOpenLink, handleMentionPress],
  );

  // Build the caption text
  const hasTitle = !!title?.trim();
  const hasDescription = !!description?.trim();
  const hasCategories = showCategories && categories && categories.length > 0;

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
          {renderSegments(titleSegments, "t")}
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
            {renderSegments(descSegments, "d")}
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
      {/* {hasCategories && (
        <View className="flex-row flex-wrap mt-1">
          {categories!.map((cat, idx) => (
            <TouchableOpacity
              key={`cat-${idx}-${cat}`}
              onPress={() => handleCategoryPress(cat)}
              activeOpacity={0.7}
              className="mr-2"
            >
              <Text className="text-sm text-theme-neutrals-300">
                #{cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase().replace(/\s+/g, '')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )} */}
    </View>
  );
};

export const FeedCaption = memo(FeedCaptionComponent);
export default FeedCaption;
