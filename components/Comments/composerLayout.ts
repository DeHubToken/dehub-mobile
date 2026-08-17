import { StyleSheet } from "react-native";

/**
 * Geometry shared by both comment composers — the bottom sheet's
 * (`components/Comments/CommentSection.tsx`) and the post detail screen's
 * (`screens/FeedDetailScreen.tsx`). They are two separate implementations by
 * history, so the sizing lives here rather than in either of them; changing a
 * number in one file only used to fix one of the two surfaces.
 *
 * The rule these encode: a control's height is set explicitly, never left to
 * fall out of its own padding. Padding-sized controls drift apart as soon as
 * their contents differ — a 20px icon and a 12px text glyph in identical
 * `padding: 8` boxes come out 36 and 31 tall, and the row shows the stagger.
 */
export const COMPOSER = {
  /** Height of the input box and of every action control beside it. */
  control: 40,
  /** Inset from the composer bar's edge to its contents, on all four sides. */
  gutter: 12,
  /** Gap between the input box and the action controls. */
  gap: 8,
  radius: 12,
} as const;

export const composerStyles = StyleSheet.create({
  /** Width-free variant, for a control whose label sets its width. */
  control: {
    height: COMPOSER.control,
    borderRadius: COMPOSER.radius,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Square variant, for the icon-only controls. */
  iconControl: {
    width: COMPOSER.control,
    height: COMPOSER.control,
    borderRadius: COMPOSER.radius,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
});
