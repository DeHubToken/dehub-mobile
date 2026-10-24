import { Platform } from 'react-native';

/** Optional so an OTA remains compatible with APKs built before this bridge. */
export async function setNavigationBarDarkIcons(darkIcons: boolean): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const { requireOptionalNativeModule } = require('expo-modules-core') as {
      requireOptionalNativeModule: (name: string) => {
        setNavigationBarDarkIcons?: (value: boolean) => Promise<boolean>;
      } | null;
    };
    const native = requireOptionalNativeModule('DehubSystemBars');
    if (typeof native?.setNavigationBarDarkIcons !== 'function') return false;
    return await native.setNavigationBarDarkIcons(darkIcons);
  } catch {
    return false;
  }
}
