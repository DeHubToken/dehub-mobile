import { navigationRef } from "../App";
import { ScreenNames } from "../navigation/ScreenNames";
import { promptFeedEvents } from "./eventBus";

/**
 * Show the feed for a hashtag.
 *
 * Hashtags are tapped from everywhere a caption renders — the home feed, a post
 * detail, a profile, search, a community — and almost none of those own the
 * feed that has to change. HomeScreen is the initial tab route and therefore
 * always mounted, so the tag travels over the same channel the prompt flow
 * already uses and this only has to bring the Home tab back to the front.
 *
 * Deliberately not persisted to MMKV: a tag tapped while reading is a look at
 * one topic, not a new default feed for every launch after it.
 */
export function openCategoryFeed(category: string): void {
  const tag = category.trim().toLowerCase();
  if (!tag) return;

  promptFeedEvents.chooseCategory(tag);

  if (navigationRef.isReady()) {
    navigationRef.navigate(ScreenNames.Home as never);
  }
}
