// Match the visible silhouettes, accounting for each 32-unit icon's padding.
export const FEED_ICON_SIZE = {
  like: 23.76, comment: 24.64, share: 21.12, bookmark: 23.76, info: 23.76, tip: 23.76, pin: 21.12,
} as const;

// Widen the bookmark silhouette without making it taller beside post info.
export const FEED_BOOKMARK_STYLE = { transform: [{ scaleX: 1.12 }] };
// Compact comment controls use the same optical proportions as the post bar.
export const COMMENT_ICON_SIZE = { like: 18, comment: 18.67, share: 16, tip: 18 } as const;
