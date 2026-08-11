import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { openInApp } from "../../libs/links.utils";
import { hasValidTLD } from "../../libs/tlds";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { DehubLinkCards, useOpenDehubLink, MAX_CARDS_PER_MESSAGE } from "../common/DehubLinkCard";
import { findDehubLinks, parseDehubLink, stripDehubLinkMatches } from "../../libs/dehub-links";

type Segment =
  | { type: "text"; value: string }
  | { type: "link"; value: string; url: string }
  | { type: "mention"; value: string; username: string };

const CHAR_LIMIT_FOR_TOGGLE = 160; // approx ~2-3 lines for our font/width

const ensureUrl = (raw: string): string => {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const parseTextToSegments = (input: string): Segment[] => {
  if (!input) return [];

  // Combined regex: @mentions or URLs
  const combinedRegex = /(@[\w.]+)|\b((?:https?:\/\/|www\.)[^\s]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi;
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
      const username = m[1].slice(1); // strip the @
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

      if (trailing) {
        segments.push({ type: "text", value: trailing });
      }
      cursor = index + m[0].length;
    }
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
  const { showUserProfile } = useUserProfileSheet();
  const openDehubLink = useOpenDehubLink();

  // DeHub links become cards, and the URLs that became cards come out of the
  // copy — before the truncation below, not after. Stripping afterwards would
  // let the character clamp cut a URL in half so it no longer matched, leaving
  // half a link on screen next to its own card; it also spent a third of the
  // visible budget on a URL nobody reads.
  const dehubLinks = useMemo(
    () => findDehubLinks([titleText, descriptionText].filter(Boolean).join("\n")).slice(0, MAX_CARDS_PER_MESSAGE),
    [titleText, descriptionText],
  );
  const linkFreeTitle = useMemo(
    () => (dehubLinks.length ? stripDehubLinkMatches(titleText, dehubLinks) : titleText),
    [titleText, dehubLinks],
  );
  const linkFreeDescription = useMemo(
    () => (dehubLinks.length ? stripDehubLinkMatches(descriptionText, dehubLinks) : descriptionText),
    [descriptionText, dehubLinks],
  );

  const trimmedDescription = useMemo(() => (linkFreeDescription || "").trim(), [linkFreeDescription]);

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

  const titleSegments = useMemo(() => parseTextToSegments(linkFreeTitle), [linkFreeTitle]);
  const collapsedDescription = useMemo(() => {
    if (!shouldTruncate) return trimmedDescription;
    return `${trimmedDescription.slice(0, CHAR_LIMIT_FOR_TOGGLE).trimEnd()}…`;
  }, [trimmedDescription, shouldTruncate]);

  const visibleDescription = useMemo(() => {
    return expanded ? trimmedDescription : collapsedDescription;
  }, [expanded, trimmedDescription, collapsedDescription]);

  const segments = useMemo(() => parseTextToSegments(visibleDescription), [visibleDescription]);

  const handleOpenLink = useCallback((url: string) => {
    // A link to something inside DeHub stays inside DeHub. Handing it to the
    // in-app browser loaded a web view of our own site inside the app.
    const dehubLink = parseDehubLink(url);
    if (dehubLink) {
      openDehubLink(dehubLink);
      return;
    }
    openInApp(url);
  }, [openDehubLink]);

  const handleMentionPress = useCallback((username: string) => {
    showUserProfile(username);
  }, [showUserProfile]);

  const renderSegments = useCallback((segs: Segment[], prefix: string) => {
    return segs.map((seg, idx) => {
      if (seg.type === "link") {
        return (
          <Text
            key={`${prefix}-${seg.url}-${idx}`}
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
            key={`${prefix}-m-${idx}`}
            className="font-bold"
            onPress={() => handleMentionPress(seg.username)}
            suppressHighlighting
          >
            {seg.value}
          </Text>
        );
      }
      return <Text key={`${prefix}-${idx}`}>{seg.value}</Text>;
    });
  }, [handleOpenLink, handleMentionPress]);

  const titleNodes = useMemo(() => {
    return renderSegments(titleSegments, "t");
  }, [titleSegments, renderSegments]);

  const descriptionNodes = useMemo(() => {
    return renderSegments(segments, "d");
  }, [segments, renderSegments]);

  // A caption that was nothing but a link still has a card to show.
  if (!titleText && !descriptionText) return null;

  return (
    <View className="px-3 py-2">
      {!!linkFreeTitle && (
        <Text
          className="text-theme-neutrals-100 text-[14px] font-semibold"
          onPress={onPressTitle}
          suppressHighlighting
        >
          {titleNodes}
        </Text>
      )}

      {!!trimmedDescription && (
        <View className={linkFreeTitle ? "mt-1" : ""}>
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

      <DehubLinkCards links={dehubLinks} />
    </View>
  );
};

export default memo(FeedDescription);
