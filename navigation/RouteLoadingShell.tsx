import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

/** Native-stack can animate this before evaluating the destination module. */
export default function RouteLoadingShell({ onBack, profile = false }: {
  onBack?: () => void;
  profile?: boolean;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const canBack = !!onBack || navigation.canGoBack?.();
  return (
    <View testID="route-loading-shell" className="flex-1 bg-theme-neutrals-900" style={{ paddingTop: insets.top }}>
      <View style={{ height: 52, paddingHorizontal: 12, justifyContent: 'center' }}>
        {canBack ? <Pressable testID="route-loading-back" accessibilityRole="button"
          accessibilityLabel={t('common.goBack')} hitSlop={8}
          onPress={onBack ?? (() => navigation.goBack())}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Text className="text-theme-neutrals-50" style={{ fontSize: 36, lineHeight: 40 }}>‹</Text>
        </Pressable> : null}
      </View>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ paddingHorizontal: 20, gap: 14 }}>
        <View className="bg-theme-neutrals-800" style={{ height: profile ? 140 : 24, width: profile ? '100%' : '66%', borderRadius: 8 }} />
        <View className="bg-theme-neutrals-800" style={{ height: 16, width: '84%', borderRadius: 4 }} />
        <View className="bg-theme-neutrals-800" style={{ height: 16, width: '58%', borderRadius: 4 }} />
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    </View>
  );
}
