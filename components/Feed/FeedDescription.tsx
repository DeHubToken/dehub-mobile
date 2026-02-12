import React, { memo, useCallback, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { openInApp } from "../../libs/links.utils";
import { hasValidTLD } from "../../libs/tlds";

type Segment =
  | { type: "text"; value: string }
  | { type: "link"; value: string; url: string };

const CHAR_LIMIT_FOR_TOGGLE = 160; // approx ~2-3 lines for our font/width

const ensureUrl = (raw: string): string => {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const parseTextToSegments = (input: string): Segment[] => {
  if (!input) return [];

  // URL detection (http(s), www., or bare domains like example.com/path)
  // Note: we intentionally keep this fairly permissive (social-app style), and then
  // trim trailing punctuation so the clickable URL is correct.
  const urlRegex = /\b((?:https?:\/\/|www\.)[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi;
  const matches = Array.from(input.matchAll(urlRegex));
  if (matches.length === 0) return [{ type: "text", value: input }];

  const segments: Segment[] = [];
  let cursor = 0;

  for (const m of matches) {
    let value = m[0];
    const index = m.index ?? 0;

    if (index > cursor) {
      segments.push({ type: "text", value: input.slice(cursor, index) });
    }

    // Strip trailing punctuation from link, but keep it in the text stream.
    // e.g. "example.com)." => link "example.com" then text ")."
    let trailing = "";
    while (value.length > 0 && /[\]\)\}.,!?;:]+$/.test(value)) {
      trailing = value.slice(-1) + trailing;
      value = value.slice(0, -1);
    }

    const url = ensureUrl(value);
    // Only treat as link if the domain has a valid IANA TLD
    if (url && hasValidTLD(value)) {
      segments.push({ type: "link", value, url });
    } else {
      segments.push({ type: "text", value });
    }

    if (trailing) {
      segments.push({ type: "text", value: trailing });
    }

    cursor = index + m[0].length;
  }

  if (cursor < input.length) {
    segments.push({ type: "text", value: input.slice(cursor) });
  }

  return segments;
};

export type FeedDescriptionProps = {
  titleText?: string;
  descriptionText?: string;
  onPressTitle?: () => void;
};

const FeedDescription: React.FC<FeedDescriptionProps> = ({
  titleText = "",
  descriptionText = "",
  onPressTitle,
}) => {
  const [expanded, setExpanded] = useState<boolean>(false);

  const trimmedDescription = useMemo(() => (descriptionText || "").trim(), [descriptionText]);

  const shouldTruncate = useMemo(() => {
    return trimmedDescription.length > CHAR_LIMIT_FOR_TOGGLE;
  }, [trimmedDescription]);

  React.useEffect(() => {
    setExpanded(false);
  }, [descriptionText]);

  const toggleExpanded = useCallback(() => {
    if (!shouldTruncate) return;
    setExpanded((p) => !p);
  }, [shouldTruncate]);

  const titleSegments = useMemo(() => parseTextToSegments(titleText), [titleText]);
  const collapsedDescription = useMemo(() => {
    if (!shouldTruncate) return trimmedDescription;
    return `${trimmedDescription.slice(0, CHAR_LIMIT_FOR_TOGGLE).trimEnd()}…`;
  }, [trimmedDescription, shouldTruncate]);

  const visibleDescription = useMemo(() => {
    return expanded ? trimmedDescription : collapsedDescription;
  }, [expanded, trimmedDescription, collapsedDescription]);

  const segments = useMemo(() => parseTextToSegments(visibleDescription), [visibleDescription]);

  const handleOpenLink = useCallback((url: string) => {
    openInApp(url);
  }, []);

  const titleNodes = useMemo(() => {
    return titleSegments.map((seg, idx) => {
      if (seg.type === "link") {
        return (
          <Text
            key={`${seg.url}-${idx}`}
            className="text-blue-400"
            onPress={() => handleOpenLink(seg.url)}
            suppressHighlighting
          >
            {seg.value}
          </Text>
        );
      }

      return <Text key={`t-${idx}`}>{seg.value}</Text>;
    });
  }, [titleSegments, handleOpenLink]);

  const descriptionNodes = useMemo(() => {
    return segments.map((seg, idx) => {
      if (seg.type === "link") {
        return (
          <Text
            key={`${seg.url}-${idx}`}
            className="text-blue-400"
            onPress={() => handleOpenLink(seg.url)}
            suppressHighlighting
          >
            {seg.value}
          </Text>
        );
      }

      return <Text key={`d-${idx}`}>{seg.value}</Text>;
    });
  }, [segments, handleOpenLink]);

  if (!titleText && !descriptionText) return null;

  return (
    <View className="px-3 py-2">
      {!!titleText && (
        <Text
          className="text-theme-neutrals-100 text-[14px] font-semibold"
          onPress={onPressTitle}
          suppressHighlighting
        >
          {titleNodes}
        </Text>
      )}

      {!!descriptionText && (
        <View className={titleText ? "mt-1" : ""}>
          <Text
            className="text-theme-neutrals-200 text-[13px] leading-5"
          >
            {descriptionNodes}
          </Text>

          {shouldTruncate && (
            <TouchableOpacity activeOpacity={0.8} onPress={toggleExpanded}>
              <Text className="text-theme-neutrals-500 text-sm">
                {expanded ? "Show less" : "Show more"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

export default memo(FeedDescription);
