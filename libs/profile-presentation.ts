export type ProfilePresentation = 'feed' | 'modal';

/**
 * Feed-origin profiles borrow Home's persistent chrome. A direct URL has no
 * feed entry to return to, even when the app happened to be sitting on Home.
 */
export const resolveProfilePresentation = (
  feedHostActive: boolean,
  source?: string,
): ProfilePresentation =>
  feedHostActive && source !== 'deeplink' ? 'feed' : 'modal';
