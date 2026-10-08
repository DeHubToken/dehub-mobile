export type ProfilePresentation = 'feed' | 'modal';

/**
 * System profiles own the full screen so Home's feed chrome cannot crop them.
 * Other themes can borrow Home's chrome; deep links always stand alone.
 */
export const resolveProfilePresentation = (
  feedHostActive: boolean,
  source?: string,
  theme?: string,
): ProfilePresentation =>
  theme !== 'system' && theme !== 'immersive' && feedHostActive && source !== 'deeplink' ? 'feed' : 'modal';
