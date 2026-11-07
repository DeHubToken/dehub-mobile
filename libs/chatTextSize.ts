/**
 * Chat text size — same five steps and key as web (src/lib/chat-text-size.ts).
 * A multiplier on top of the phone's own font size: React Native already
 * scales Text with Android font scale and iOS Dynamic Type, so "Large" here is
 * large on top of whatever the reader picked in their phone settings.
 */
export const CHAT_TEXT_SIZES = ['small', 'default', 'large', 'larger', 'largest'] as const;
export type ChatTextSize = (typeof CHAT_TEXT_SIZES)[number];

export const CHAT_TEXT_SCALE: Record<ChatTextSize, number> = {
  small: 0.93,
  default: 1,
  large: 1.2,
  larger: 1.4,
  largest: 1.7,
};

export function isChatTextSize(value: unknown): value is ChatTextSize {
  return typeof value === 'string' && (CHAT_TEXT_SIZES as readonly string[]).includes(value);
}
