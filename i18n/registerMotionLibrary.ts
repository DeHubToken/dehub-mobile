import i18n from './index';
import { MOTION_LIBRARY_COPY } from './motionLibraryCopy';

for (const [locale, copy] of Object.entries(MOTION_LIBRARY_COPY)) {
  i18n.addResourceBundle(locale, 'translation', { motionLibrary: copy }, true, true);
}
