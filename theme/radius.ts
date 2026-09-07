/**
 * Corner radii.
 *
 * Web's button recipe (`buttonVariants` in dehubweb `src/components/ui/button.tsx`)
 * is `rounded-xl` on every variant and every size — including `size: "icon"`,
 * which is a 40pt square with 12pt corners, not a circle. Filter and category
 * chips are `rounded-lg`. So on a button, an icon button, a chip or a segmented
 * control, `full` is wrong: use `lg` (12) for buttons and icon buttons, `md` (8)
 * for chips and segment items, `xl` (16) for larger tiles and icon slabs.
 *
 * `full` is for things that genuinely are round, and nothing else: avatars and
 * token logos, status dots, count badges, progress tracks and fills, sheet drag
 * handles, switch tracks and knobs, radio marks, spinners, and the in-call
 * controls that follow the platform's own phone-call convention.
 */
export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;
