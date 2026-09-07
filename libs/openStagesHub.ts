import { navigationRef } from "../App";
import { ScreenNames } from "../navigation/ScreenNames";

/**
 * Open the Stages hub.
 *
 * Stages discovery used to be a bottom sheet (`StagesBrowseModal`), so every
 * entry point called `openModal("browse")`. It is a screen now — the same split
 * web has, where /stages is a page and only the live room and the create form
 * are overlays — so "browse" means navigate, and this is where that happens.
 *
 * Imperative rather than a hook because the callers are a module-level nav
 * list, a deep-link handler and `useStages` itself, none of which hold a
 * navigation prop. Same shape as `libs/openCategoryFeed`.
 */
export function openStagesHub(): void {
  if (navigationRef.isReady()) {
    navigationRef.navigate(ScreenNames.Stages as never);
  }
}
