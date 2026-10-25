import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { KeepDarkScope } from '../libs/jsx/tone';
import NavigationLoadingDots from './NavigationLoadingDots';

/** Native-stack can animate this before evaluating the destination module. */
export default function RouteLoadingShell({ onBack }: {
  onBack?: () => void;
  profile?: boolean;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const canBack = !!onBack || navigation.canGoBack?.();
  return (
    <KeepDarkScope>
    <View testID="route-loading-shell" style={{ flex: 1, backgroundColor: '#000000', paddingTop: insets.top }}>
      <View style={{ height: 52, paddingHorizontal: 12, justifyContent: 'center' }}>
        {canBack ? <Pressable testID="route-loading-back" accessibilityRole="button"
          accessibilityLabel={t('common.goBack')} hitSlop={8}
          onPress={onBack ?? (() => navigation.goBack())}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 36, lineHeight: 40 }}>‹</Text>
        </Pressable> : null}
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel={t('common.loading')}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 52 + insets.top }}>
        <NavigationLoadingDots />
      </View>
    </View>
    </KeepDarkScope>
  );
}
