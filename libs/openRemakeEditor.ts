import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenNames } from '../navigation/ScreenNames';
import type { AppStackParamList } from '../navigation/types';
import type { GeneratedMediaSource } from './editor/importGeneratedMedia';

/** A new route is necessary: an existing editor reads importMedia only on mount. */
export function openRemakeEditor(nav: Pick<NativeStackNavigationProp<AppStackParamList>, 'push'>, source: GeneratedMediaSource) {
  nav.push(ScreenNames.MediaEditor, { importMedia: source });
}
