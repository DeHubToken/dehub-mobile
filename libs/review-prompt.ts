import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { createLogger } from "./logger";
import { track } from "./analytics";

const log = createLogger("review-prompt");

const LAST_PROMPT_KEY = "dehub-review-prompted-at";
const POSTS_KEY = "dehub-posts-published";
const FIRST_TIP_KEY = "dehub-first-tip-seen";
const DAY = 86400_000;
export const REVIEW_COOLDOWN_MS = 90 * DAY;
export const REVIEW_INSTALL_GRACE_MS = 3 * DAY;
export const REVIEW_POST_COUNT = 5;

export type ReviewMoment = "first_tip" | "video_milestone" | "fifth_post";

type StoreReviewModule = typeof import("expo-store-review");

// Required lazily: binaries built before expo-store-review was added do not
// have the native module, and an OTA update must not crash them.
function loadStoreReview(): StoreReviewModule | null {
  try {
    return require("expo-store-review") as StoreReviewModule;
  } catch {
    return null;
  }
}

async function readNumber(key: string): Promise<number> {
  const raw = await AsyncStorage.getItem(key);
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) ? value : 0;
}

export async function canPromptForReview(now = Date.now()): Promise<boolean> {
  const lastPrompt = await readNumber(LAST_PROMPT_KEY);
  if (lastPrompt && now - lastPrompt < REVIEW_COOLDOWN_MS) return false;
  const installedAt = await Application.getInstallationTimeAsync().catch(() => null);
  if (!installedAt || now - installedAt.getTime() < REVIEW_INSTALL_GRACE_MS) return false;
  return true;
}

/** Ask the OS for its review sheet after a good moment; the OS may still decline to show it. */
export async function requestReviewAfter(moment: ReviewMoment): Promise<boolean> {
  try {
    if (!(await canPromptForReview())) return false;
    const StoreReview = loadStoreReview();
    if (!StoreReview || !(await StoreReview.hasAction())) return false;
    await AsyncStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));
    await StoreReview.requestReview();
    track("review_prompted", { moment });
    return true;
  } catch (error) {
    log.warn("Review prompt failed", { moment, error });
    return false;
  }
}

let postWrites: Promise<unknown> = Promise.resolve();

/** Count posts published from this device: the first is tracked, the fifth asks for a review. */
export function notePostPublished(): Promise<void> {
  const next = postWrites.catch(() => undefined).then(async () => {
    const count = (await readNumber(POSTS_KEY)) + 1;
    await AsyncStorage.setItem(POSTS_KEY, String(count));
    if (count === 1) track("first_post");
    if (count === REVIEW_POST_COUNT) await requestReviewAfter("fifth_post");
  });
  postWrites = next;
  return next.catch((error) => log.warn("Could not count published post", error));
}

/** Tips (first one only) and video milestones are moments worth a review ask. */
export async function noteNotificationMoment(type: string | undefined): Promise<void> {
  try {
    if (type === "video_milestone") {
      await requestReviewAfter("video_milestone");
    } else if (type === "tip") {
      if (await AsyncStorage.getItem(FIRST_TIP_KEY)) return;
      await AsyncStorage.setItem(FIRST_TIP_KEY, "1");
      await requestReviewAfter("first_tip");
    }
  } catch (error) {
    log.warn("Could not record notification moment", error);
  }
}
