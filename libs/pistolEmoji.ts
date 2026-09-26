import React from "react";
import { Image, StyleSheet } from "react-native";

/**
 * 🔫 as an actual pistol, matching the web app.
 *
 * Apple, Google and Samsung all redrew U+1F52B as a water gun, so the system
 * emoji font shows a toy. The web fixes it with a one-glyph font first in the
 * CSS stack (dehubweb/src/index.css), but React Native has no per-character font
 * fallback and app-font COLR support varies by OS version, so here every 🔫 in
 * a plain string child of <Text> becomes an inline image instead. Artwork is
 * Twemoji 2.2 (CC-BY 4.0, twitter/twemoji).
 *
 * TextInput cannot hold inline images, so a draft still shows the platform
 * glyph until it is posted.
 */
const PISTOL = "\u{1F52B}";
const SOURCE = require("../assets/emoji/pistol.png");

/** Tailwind `text-*` sizes, for nodes sized through className rather than style. */
const CLASS_SIZE: Record<string, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
  "5xl": 48,
  "6xl": 60,
};
const CLASS_SIZE_RE = /(?:^|[\s:])text-(xs|sm|base|lg|xl|[2-6]xl|\[(\d+(?:\.\d+)?)px\])(?:$|\s)/;

/** React Native's own default when nothing sets a size. */
const DEFAULT_SIZE = 14;

function fontSizeFor(style: unknown, className: unknown): number {
  try {
    const flat = style == null ? null : (StyleSheet.flatten(style as never) as { fontSize?: number } | null);
    if (flat && typeof flat.fontSize === "number") return flat.fontSize;
  } catch {
    /* animated styles — fall through */
  }
  if (typeof className === "string") {
    const match = CLASS_SIZE_RE.exec(className);
    if (match) return match[2] ? Number(match[2]) : CLASS_SIZE[match[1]];
  }
  return DEFAULT_SIZE;
}

function hasPistol(children: unknown): boolean {
  if (typeof children === "string") return children.includes(PISTOL);
  if (Array.isArray(children)) return children.some(hasPistol);
  return false;
}

function split(text: string, size: number, keyBase: string): React.ReactNode[] {
  const parts = text.split(PISTOL);
  const out: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part) out.push(part);
    if (i < parts.length - 1) {
      out.push(
        React.createElement(Image, {
          key: `${keyBase}-${i}`,
          source: SOURCE,
          accessibilityLabel: PISTOL,
          style: { width: size * 1.15, height: size * 1.15 },
        })
      );
    }
  });
  return out;
}

/**
 * Returns props with every 🔫 in string children swapped for the pistol image,
 * or the same props object untouched when there is none (the common case —
 * a substring check per string child and nothing else).
 */
export function withPistolEmoji(props: any): any {
  const children = props.children;
  if (!hasPistol(children)) return props;
  const size = fontSizeFor(props.style, props.className);
  const list = Array.isArray(children) ? children : [children];
  const next: React.ReactNode[] = [];
  list.forEach((child, i) => {
    if (typeof child === "string" && child.includes(PISTOL)) next.push(...split(child, size, `pistol-${i}`));
    else next.push(child);
  });
  // Spread into a Fragment rather than handing back an array, so the original
  // unkeyed element children do not trip React's missing-key warning.
  return { ...props, children: React.createElement(React.Fragment, null, ...next) };
}
