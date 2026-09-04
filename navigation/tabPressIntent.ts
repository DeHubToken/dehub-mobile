/**
 * What a press on a bottom-tab button is asking a feed to do.
 *
 * The tab bar decides this once per press and ships it as the `tabPress`
 * event's `data`, so the several feed listeners that all hear the same event
 * agree on the answer instead of each working it out for itself.
 *
 * - `navigate`     — the tab was not focused; the press is just a move.
 * - `scrollToTop`  — first press on the focused tab; cheap, no network.
 * - `refresh`      — a further press on a tab that is already focused.
 */
export type TabPressIntent = "navigate" | "scrollToTop" | "refresh";

/**
 * Read the intent off a `tabPress` event.
 *
 * Falls back to `refresh` when the event carries no data: anything emitting
 * `tabPress` without going through FloatingBottomTabBar (react-navigation's
 * own tab bar, tests) keeps the old tap-to-refresh behaviour.
 */
export function tabPressIntentOf(event: unknown): TabPressIntent {
  const intent = (event as { data?: { intent?: TabPressIntent } } | null)?.data?.intent;
  return intent ?? "refresh";
}
