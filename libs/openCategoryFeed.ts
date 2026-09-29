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
 * already uses, and this brings that Home back to the front.
 *
 * Home is a tab inside Root, and actions are not searched for in child
 * navigators, so a bare navigate('Home') from a pushed page (post, profile,
 * community) is dropped. Going through Root with `pop` pops back to the Root
 * that is already mounted rather than pushing a second one whose fresh Home
 * never heard the tag.
 *
 * Deliberately not persisted to MMKV: a tag tapped while reading is a look at
 * one topic, not a new default feed for every launch after it.
 */
export function openCategoryFeed(category: string): void {
  const tag = category.trim().toLowerCase();
  if (!tag) return;

  promptFeedEvents.chooseCategory(tag);

  if (navigationRef.isReady()) {
    navigationRef.navigate({ name: ScreenNames.Root, params: { screen: ScreenNames.Home }, pop: true } as never);
  }
}
