/**
 * Inline rendering for emoji that are not Unicode characters — the mobile
 * twin of dehubweb's components/app/emoji/EmojiText.tsx.
 *
 * `expandEmojiTokens` runs over the output of the text renderers (LinkedText,
 * the live chat renderer, captions, comments): every plain-string part is
 * scanned for `<:name:id>` and `:shortcode:` and those become an image nested
 * in the surrounding <Text>. Links, mentions and tags are already elements by
 * then, so a colon inside a URL is never touched.
 *
 * Nothing loads until a message actually contains a candidate token, and a
 * token that resolves to nothing renders back as the exact text that was
 * typed.
 */

import React, { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Image, Text } from "react-native";
import { discordEmojiUrl, mayContainEmojiTokens, tokenizeEmoji } from "../../libs/emoji/tokens";
import { getShortcodes } from "../../libs/emoji/shortcodes";
import { useKidsModeLock } from "../../hooks/useKidsModeLock";
import {
  customEmojisLoaded,
  getCustomEmoji,
  getCustomEmojis,
  loadCustomEmojis,
  subscribeCustomEmojis,
} from "../../libs/emoji/custom-emoji";

const DEFAULT_FONT_SIZE = 15;

export function useCustomEmojis() {
  const list = useSyncExternalStore(subscribeCustomEmojis, getCustomEmojis, getCustomEmojis);
  useEffect(() => {
    if (!customEmojisLoaded()) void loadCustomEmojis();
  }, []);
  return list;
}

/**
 * One image emoji. Nested inside a <Text> it flows with the line; `size` is
 * the rendered height (font size × 1.25, like web's 1.375em minus the line
 * gap a phone does not add).
 */
export function EmojiImage({ src, name, size }: { src: string; name: string; size: number }) {
  const [broken, setBroken] = useState(false);
  // Custom and Discord emoji are unreviewed images: Kids Mode reads the name.
  const kids = useKidsModeLock();
  if (broken || kids) return <>{`:${name}:`}</>;
  return (
    <Image
      source={{ uri: src }}
      accessibilityLabel={`:${name}:`}
      resizeMode="contain"
      onError={() => setBroken(true)}
      style={{ width: size, height: size }}
    />
  );
}

function ShortcodeEmoji({ code, raw, size }: { code: string; raw: string; size: number }) {
  useCustomEmojis();
  // Synchronous: the table is parsed here, the first time a candidate code renders.
  const standard = getShortcodes()[code];
  if (standard) return <>{standard}</>;
  const custom = getCustomEmoji(code);
  if (custom) return <EmojiImage src={custom.image_url} name={custom.shortcode} size={size} />;
  return <>{raw}</>;
}

/**
 * One emoji given as a string that may be Unicode, `:code:` or `<:name:id>` —
 * reaction chips use this. Wraps itself in a <Text> so it can sit in a row.
 */
export function InlineEmoji({ value, size = 16 }: { value: string; size?: number }) {
  const tokens = tokenizeEmoji(value);
  const imageSize = Math.round(size * 1.25);
  return (
    <Text style={{ fontSize: size }}>
      {tokens.map((t, i) =>
        t.kind === "text" ? (
          <Fragment key={i}>{t.text}</Fragment>
        ) : t.kind === "discord" ? (
          <EmojiImage key={i} src={discordEmojiUrl(t.id, t.animated)} name={t.name} size={imageSize} />
        ) : (
          <ShortcodeEmoji key={i} code={t.code} raw={t.raw} size={imageSize} />
        ),
      )}
    </Text>
  );
}

/**
 * Turns the string parts of an already-rendered text run into text + inline
 * emoji. Non-string parts (links, mentions) pass through untouched. Must be
 * rendered inside a <Text>.
 */
export function expandEmojiTokens(
  parts: ReactNode[] | ReactNode,
  { fontSize = DEFAULT_FONT_SIZE, keyPrefix = "em" }: { fontSize?: number; keyPrefix?: string } = {},
): ReactNode[] {
  const list = Array.isArray(parts) ? parts : [parts];
  const size = Math.round(fontSize * 1.25);
  const out: ReactNode[] = [];
  list.forEach((part, pi) => {
    if (typeof part !== "string" || !mayContainEmojiTokens(part)) {
      out.push(part);
      return;
    }
    const tokens = tokenizeEmoji(part);
    if (tokens.length === 1 && tokens[0].kind === "text") {
      out.push(part);
      return;
    }
    tokens.forEach((t, ti) => {
      const key = `${keyPrefix}-${pi}-${ti}`;
      if (t.kind === "text") out.push(<Fragment key={key}>{t.text}</Fragment>);
      else if (t.kind === "discord") out.push(<EmojiImage key={key} src={discordEmojiUrl(t.id, t.animated)} name={t.name} size={size} />);
      else out.push(<ShortcodeEmoji key={key} code={t.code} raw={t.raw} size={size} />);
    });
  });
  return out;
}
