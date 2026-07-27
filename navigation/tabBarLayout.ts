/**
 * Layout constants for the floating bottom tab bar.
 *
 * Kept in a leaf module rather than in FloatingBottomTabBar itself: scroll
 * surfaces all over the app need the content inset, and importing it from the
 * tab bar would drag Reanimated, both blur libraries, AuthContext and the DM
 * store into every one of their module graphs for the sake of one number.
 */

/** Height of the nav pill itself. */
export const TAB_BAR_PILL_HEIGHT = 52;

/** Height of the scrim gradient that seats the pill in the scene. */
export const TAB_BAR_SCRIM_HEIGHT = 96;

/**
 * Bottom content inset every full-screen scroll surface should reserve, so its
 * last row clears the pill and the scrim behind it instead of ending up
 * unreadable and untappable underneath them.
 */
export const TAB_BAR_CONTENT_INSET = TAB_BAR_SCRIM_HEIGHT;
