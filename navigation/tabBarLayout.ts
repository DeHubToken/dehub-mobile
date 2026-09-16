/**
 * Layout constants for the floating bottom tab bar.
 *
 * Kept in a leaf module rather than in FloatingBottomTabBar itself: scroll
 * surfaces all over the app need the content inset, and importing it from the
 * tab bar would drag Reanimated, expo-blur, AuthContext and the DM store into
 * every one of their module graphs for the sake of one number.
 */

/** Height of the nav pill itself. */
export const TAB_BAR_PILL_HEIGHT = 52;

/**
 * Bottom content inset every full-screen scroll surface should reserve, so its
 * last row clears the pill instead of ending up unreadable and untappable
 * underneath it. Wider than the pill on purpose: the pill floats clear of the
 * screen edge, and a row that stops flush against it reads as cut off.
 */
export const TAB_BAR_CONTENT_INSET = 96;
