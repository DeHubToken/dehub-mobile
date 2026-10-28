import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { KitButton } from '../page/PageKit';

export function CommentLoadError({ isFetching, onRetry }: { isFetching: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 8, paddingVertical: 12 }}>
      <Text accessibilityRole="alert" style={{ color: '#808089', textAlign: 'center', fontSize: 12 }}>
        {t('comments.loadFailed')}
      </Text>
      <KitButton variant="quiet" label={t(isFetching ? 'common.loading' : 'common.retry')}
        disabled={isFetching} onPress={isFetching ? undefined : onRetry} />
    </View>
  );
}
