/**
 * Shared text-field metrics.
 *
 * A `TextInput` dropped into a fixed-height row clips its own ascenders on
 * Android: the platform reserves font padding above and below the glyphs, RN
 * adds its own vertical padding on top of that, and the result is a content
 * box taller than the box it was put in. The line is then cut at the top —
 * the S of "Search" loses its head — which reads as a rendering fault rather
 * than a layout one, so it gets reported as "the text is cut off".
 *
 * Spread FIELD_TEXT onto any single-line TextInput whose height comes from its
 * wrapper (`h-10`, `h-11`, `h-12`) or from its own class. It zeroes the two
 * paddings, drops the font padding, and centres what is left in whatever
 * height the box has. Horizontal padding is deliberately untouched: fields set
 * that themselves, through `px-*` on the wrapper or `ml-*` on the input.
 *
 * A multi-line field wants `textAlignVertical: "top"` instead — see
 * `components/LiveChat/LiveChatInput.tsx`, which carries its own metrics.
 */
export const FIELD_TEXT = {
  paddingTop: 0,
  paddingBottom: 0,
  includeFontPadding: false,
  textAlignVertical: "center",
} as const;
