// Legacy video deep links now resolve to the same unified post surface used by
// the feed and web app. Keeping this route alias preserves old shared links
// without exposing the retired standalone video-detail interface.
export { default } from "./FeedDetailScreen";
