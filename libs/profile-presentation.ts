export type ProfilePresentation = 'feed' | 'modal';

/**
 * Android profiles own their back bar in every theme. iOS retains its
 * existing theme presentation; deep links always stand alone.
 */
export const resolveProfilePresentation = (
  feedHostActive: boolean,
  source?: string,
  theme?: string,
  platform?: string,
): ProfilePresentation =>
  platform !== 'android' && theme !== 'system' && theme !== 'immersive' && feedHostActive && source !== 'deeplink' ? 'feed' : 'modal';
