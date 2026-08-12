/**
 * Markdown renderer.
 * ==================
 * Port of dehubweb's `src/lib/markdown.tsx` for React Native.
 *
 * RULE (same as web's): all AI-generated text MUST be rendered through this.
 * The models answer in markdown — the assistant bubble used to print the raw
 * source, so a reply arrived on a phone as `**Followers:** 1,204` with the
 * asterisks visible and every list item run into one paragraph.
 *
 * Supports the same subset web does: `#`..`######` headings, `-`/`*` and
 * numbered lists, `**bold**`, `*italic*`, `` `code` ``, `[text](url)`, bare
 * URLs and email addresses (tap to copy, as on web).
 */

import React, { memo, useCallback } from 'react';
import { Linking, StyleSheet, Text, TextStyle, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { toastSuccess } from '../../libs/toast';

interface MarkdownTextProps {
  content: string;
  /** Base text style. Sizes for headings and code derive from this. */
  style?: TextStyle;
  color?: string;
}

const LINK_RE = /^(.*?)\[([^\]]+)\]\(([^)]+)\)(.*)$/s;
const BOLD_RE = /^(.*?)(\*\*|__)(.+?)\2(.*)$/s;
const ITALIC_RE = /^(.*?)(\*|_)(.+?)\2(.*)$/s;
const CODE_RE = /^(.*?)`(.+?)`(.*)$/s;
const URL_RE = /^(.*?)(https?:\/\/[^\s<>[\]()]+)(.*)$/s;
const EMAIL_RE = /^(.*?)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(.*)$/s;

/** Trailing punctuation is far more often prose than part of the URL. */
function trimUrl(url: string): { url: string; trailing: string } {
  const match = url.match(/[.,;:!?)]+$/);
  if (!match) return { url, trailing: '' };
  return { url: url.slice(0, -match[0].length), trailing: match[0] };
}

const MarkdownText: React.FC<MarkdownTextProps> = ({ content, style, color = '#F9FBFF' }) => {
  const openUrl = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      // A malformed link from a model is not worth an error toast.
    });
  }, []);

  const copyEmail = useCallback(async (email: string) => {
    await Clipboard.setStringAsync(email);
    toastSuccess('Email copied');
  }, []);

  const baseSize = (style?.fontSize as number) ?? 14;
  const baseStyle: TextStyle = { color, fontSize: baseSize, lineHeight: baseSize * 1.45, ...style };

  /** Plain URLs and emails, the innermost pass. */
  const renderUrls = (text: string, keyPrefix: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let i = 0;

    while (remaining.length > 0) {
      const emailMatch = remaining.match(EMAIL_RE);
      const urlMatch = remaining.match(URL_RE);
      // Whichever appears first in the string wins, so an email inside a URL's
      // query string is not mistaken for a standalone address.
      const emailFirst =
        emailMatch && (!urlMatch || emailMatch[1].length <= urlMatch[1].length);

      if (emailFirst && emailMatch) {
        if (emailMatch[1]) parts.push(emailMatch[1]);
        const email = emailMatch[2];
        parts.push(
          <Text
            key={`${keyPrefix}-em-${i++}`}
            style={s.link}
            onPress={() => copyEmail(email)}
            suppressHighlighting
          >
            {email}
          </Text>,
        );
        remaining = emailMatch[3];
        continue;
      }

      if (urlMatch) {
        if (urlMatch[1]) parts.push(urlMatch[1]);
        const { url, trailing } = trimUrl(urlMatch[2]);
        parts.push(
          <Text
            key={`${keyPrefix}-url-${i++}`}
            style={s.link}
            onPress={() => openUrl(url)}
            suppressHighlighting
          >
            {url}
          </Text>,
        );
        remaining = trailing + urlMatch[3];
        continue;
      }

      parts.push(remaining);
      break;
    }
    return parts;
  };

  /**
   * One inline pass handling links, bold, italic and code, recursing on the
   * text either side. Order matters: `**` has to be tried before `*`, or every
   * bold span renders as an italic asterisk.
   */
  const renderInline = (text: string, keyPrefix: string, depth = 0): React.ReactNode[] => {
    if (depth > 6) return renderUrls(text, keyPrefix);

    const linkMatch = text.match(LINK_RE);
    if (linkMatch) {
      const url = linkMatch[3];
      return [
        ...renderInline(linkMatch[1], `${keyPrefix}a`, depth + 1),
        <Text
          key={`${keyPrefix}-link`}
          style={s.link}
          onPress={() => openUrl(url)}
          suppressHighlighting
        >
          {linkMatch[2]}
        </Text>,
        ...renderInline(linkMatch[4], `${keyPrefix}b`, depth + 1),
      ];
    }

    const boldMatch = text.match(BOLD_RE);
    if (boldMatch) {
      return [
        ...renderInline(boldMatch[1], `${keyPrefix}a`, depth + 1),
        <Text key={`${keyPrefix}-b`} style={s.bold}>
          {renderInline(boldMatch[3], `${keyPrefix}c`, depth + 1)}
        </Text>,
        ...renderInline(boldMatch[4], `${keyPrefix}b`, depth + 1),
      ];
    }

    const italicMatch = text.match(ITALIC_RE);
    if (italicMatch) {
      return [
        ...renderInline(italicMatch[1], `${keyPrefix}a`, depth + 1),
        <Text key={`${keyPrefix}-i`} style={s.italic}>
          {renderInline(italicMatch[3], `${keyPrefix}c`, depth + 1)}
        </Text>,
        ...renderInline(italicMatch[4], `${keyPrefix}b`, depth + 1),
      ];
    }

    const codeMatch = text.match(CODE_RE);
    if (codeMatch) {
      return [
        ...renderInline(codeMatch[1], `${keyPrefix}a`, depth + 1),
        <Text key={`${keyPrefix}-c`} style={[s.code, { fontSize: baseSize - 1 }]}>
          {` ${codeMatch[2]} `}
        </Text>,
        ...renderInline(codeMatch[3], `${keyPrefix}b`, depth + 1),
      ];
    }

    return renderUrls(text, keyPrefix);
  };

  const blocks: React.ReactNode[] = [];
  const lines = content.split('\n');
  let listBuffer: { marker: string; text: string; key: string }[] = [];

  const flushList = (atIndex: number) => {
    if (!listBuffer.length) return;
    const items = listBuffer;
    listBuffer = [];
    blocks.push(
      <View key={`list-${atIndex}`} style={s.list}>
        {items.map((item) => (
          <View key={item.key} style={s.listRow}>
            <Text style={[baseStyle, s.listMarker]}>{item.marker}</Text>
            <Text style={[baseStyle, s.listText]}>{renderInline(item.text, item.key)}</Text>
          </View>
        ))}
      </View>,
    );
  };

  lines.forEach((line, index) => {
    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
    const olMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);

    if (ulMatch) {
      listBuffer.push({ marker: '•', text: ulMatch[1], key: `li-${index}` });
      return;
    }
    if (olMatch) {
      listBuffer.push({ marker: `${olMatch[1]}.`, text: olMatch[2], key: `li-${index}` });
      return;
    }

    flushList(index);

    if (line.trim() === '') {
      blocks.push(<View key={`sp-${index}`} style={s.spacer} />);
      return;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const size = level <= 1 ? baseSize + 4 : level === 2 ? baseSize + 2 : baseSize;
      blocks.push(
        <Text
          key={`h-${index}`}
          style={[baseStyle, s.heading, { fontSize: size, lineHeight: size * 1.35 }]}
        >
          {renderInline(headingMatch[2], `h-${index}`)}
        </Text>,
      );
      return;
    }

    blocks.push(
      <Text key={`p-${index}`} style={baseStyle}>
        {renderInline(line, `p-${index}`)}
      </Text>,
    );
  });

  flushList(lines.length);

  return <View style={s.root}>{blocks}</View>;
};

const s = StyleSheet.create({
  root: { width: '100%' },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  code: {
    fontFamily: 'monospace',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 4,
  },
  link: { textDecorationLine: 'underline' },
  heading: { fontWeight: '700', marginTop: 8, marginBottom: 2 },
  list: { marginTop: 2, marginBottom: 2 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start' },
  listMarker: { width: 20 },
  listText: { flex: 1 },
  spacer: { height: 8 },
});

export default memo(MarkdownText);
