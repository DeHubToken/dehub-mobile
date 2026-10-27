/**
 * The moment after Post: a card for the new post lands at the top of Home,
 * in the style chosen in Settings (libs/postLandingStyle), and gives way to
 * the real post once the feed has it.
 *
 * Phases, for the one post landing at a time:
 *  - waiting:  nothing in the feed yet. Ghost and drop wait for the composer
 *              to slide away; pill waits for the post to be published.
 *  - arriving: the card is in Home's list and its entrance is running (for
 *              morph and pill, the overlay's flight into it).
 *  - shown:    the card rests at the top, showing how the post is getting on.
 *  - leaving:  the real post replaced it, or it was given up on.
 *
 * Home's list (components/Home/InfiniteVideoFeed) draws the card and does
 * the swap; the root overlay (components/Upload/PostLandingOverlay) flies
 * morph and pill into it.
 */
import { proxy } from 'valtio';
import { getAppPrefs } from '../hooks/useAppPrefs';
import type { PostLandingStyle } from './postLandingStyle';

export type PostLandingPhase = 'waiting' | 'arriving' | 'shown' | 'leaving';

export interface PostLanding {
  jobId: string;
  style: PostLandingStyle;
  phase: PostLandingPhase;
}

export interface LandingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PostLandingStore {
  landing: PostLanding | null;
  /**
   * The post that took the card's place. Home keeps it first until the
   * reader refreshes, so a ranked feed does not whisk it away the moment it
   * arrives.
   */
  pinnedTokenId: number | null;
  /** The last post that landed, whose upload pill has nothing left to say. */
  landedJobId: string | null;
}

export const postLandingState = proxy<PostLandingStore>({ landing: null, pinnedTokenId: null, landedJobId: null });

const targetListeners = new Set<(rect: LandingRect) => void>();
let target: LandingRect | null = null;

/** The card's place on screen, in window coordinates, for the overlay to fly to. */
export const landingTarget = {
  get(): LandingRect | null {
    return target;
  },
  set(rect: LandingRect | null) {
    target = rect;
    if (rect) targetListeners.forEach((fn) => fn(rect));
  },
  subscribe(listener: (rect: LandingRect) => void): () => void {
    targetListeners.add(listener);
    return () => {
      targetListeners.delete(listener);
    };
  },
};

/** Where the upload pill sits, the pill style's starting point. */
export const uploadPillRect: { current: LandingRect | null } = { current: null };

/** The composer's own slide out of the way, before ghost and drop come in. */
export const SHEET_CLEAR_MS = 380;
/** How long the card waits for the feed to bring the real post. */
const GIVE_UP_AFTER_PUBLISH_MS = 12_000;
/** The removal's own animation, before the landing is forgotten. */
const LEAVE_MS = 420;

const beginListeners = new Set<() => void>();
const timers = new Set<ReturnType<typeof setTimeout>>();

function later(fn: () => void, ms: number) {
  const timer = setTimeout(() => {
    timers.delete(timer);
    fn();
  }, ms);
  timers.add(timer);
}

function landingFor(jobId: string): PostLanding | null {
  const landing = postLandingState.landing;
  return landing && landing.jobId === jobId ? landing : null;
}

export const postLandingActions = {
  /** Called as the composer closes on a queued post. Returns the style it will land in. */
  begin(jobId: string): PostLandingStyle {
    const style = getAppPrefs().postLanding;
    timers.forEach(clearTimeout);
    timers.clear();
    landingTarget.set(null);
    postLandingState.pinnedTokenId = null;
    postLandingState.landing = { jobId, style, phase: style === 'morph' ? 'arriving' : 'waiting' };
    if (style === 'ghost' || style === 'drop') later(() => postLandingActions.arrive(jobId), SHEET_CLEAR_MS);
    beginListeners.forEach((fn) => fn());
    return style;
  },

  arrive(jobId: string) {
    const landing = landingFor(jobId);
    if (landing?.phase === 'waiting') landing.phase = 'arriving';
  },

  /** The post exists on the server. The pill's card comes in now. */
  published(jobId: string) {
    const landing = landingFor(jobId);
    if (!landing) return;
    if (landing.style === 'pill' && landing.phase === 'waiting') landing.phase = 'arriving';
    later(() => postLandingActions.leave(jobId), GIVE_UP_AFTER_PUBLISH_MS);
  },

  /** The entrance finished. */
  settle(jobId: string) {
    const landing = landingFor(jobId);
    if (landing?.phase === 'arriving') landing.phase = 'shown';
  },

  /** The card goes. `tokenId` is the real post taking its place, if it has one. */
  leave(jobId: string, tokenId?: number) {
    const landing = landingFor(jobId);
    if (!landing || landing.phase === 'leaving') return;
    if (landing.phase === 'waiting') {
      postLandingState.landing = null;
      return;
    }
    if (tokenId != null) {
      postLandingState.pinnedTokenId = tokenId;
      postLandingState.landedJobId = jobId;
    }
    landing.phase = 'leaving';
    later(() => {
      if (landingFor(jobId)) postLandingState.landing = null;
    }, LEAVE_MS);
  },

  /** A refresh the reader asked for lets the feed order itself again. */
  unpin() {
    postLandingState.pinnedTokenId = null;
  },
};

export const postLandingEvents = {
  /** A landing started: Home's list goes back to the top under the closing composer. */
  onBegin(listener: () => void): () => void {
    beginListeners.add(listener);
    return () => {
      beginListeners.delete(listener);
    };
  },
};
