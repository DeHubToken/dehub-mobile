export type ProfilePresentation = 'feed' | 'modal';

/**
 * Profiles open over the page, with their own back bar, in every theme and on
 * both platforms.
 *
 * iPhone used to draw a themed profile inside Home's feed ('feed'), which
 * re-rendered every feed page and card before the profile's first frame. Its
 * profile is now a see-through window over the app (ProfileSurface), so a
 * canvas theme's backdrop shows through it as it does on Android.
 */
export const resolveProfilePresentation = (
  _feedHostActive: boolean,
  _source?: string,
  _theme?: string,
  _platform?: string,
): ProfilePresentation => 'modal';
