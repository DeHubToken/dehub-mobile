import React from 'react';
import { Pressable, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ScreenNames } from '../navigation/ScreenNames';

export default function FeedbackLink({ source }: { source: 'converter' | 'migration' }) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  return (
    <Pressable accessibilityRole="link" onPress={() => navigation.navigate(ScreenNames.Feedback, { source })} hitSlop={8} className="self-start px-4 py-2">
      <Text className="text-theme-neutrals-300 text-xs underline">{t('stats.feedback.title', 'Feedback')}</Text>
    </Pressable>
  );
}
