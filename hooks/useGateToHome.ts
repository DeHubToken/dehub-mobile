import { useCallback } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ScreenNames } from '../navigation/ScreenNames';

type GateOptions = {
  strategy?: 'replace' | 'reset';
};

// Gate a screen: when allow=false and the screen focuses, send the user to Home.
// Default uses `replace` to avoid adding history entries; `reset` is a bigger hammer.
export function useGateToHome(allow: boolean, opts: GateOptions = {}) {
  const navigation = useNavigation<any>();
  const strategy = opts.strategy ?? 'replace';

  useFocusEffect(
    useCallback(() => {
      if (allow) return undefined;

      if (strategy === 'reset') {
        navigation.reset({
          index: 0,
          routes: [
            { name: ScreenNames.Root as never, params: { screen: ScreenNames.Home } as never } as never,
          ],
        });
      } else {
        navigation.replace(
          ScreenNames.Root as never,
          { screen: ScreenNames.Home } as never,
        );
      }

      return undefined;
    }, [allow, strategy, navigation])
  );
}
