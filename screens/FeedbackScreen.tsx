import React from 'react';
import { KeyboardAvoidingView, ScrollView } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import ScreenHeader from '../components/ScreenHeader';
import FeedbackSection from '../components/Stats/FeedbackSection';
import { useKeyboardOffset } from '../hooks/useKeyboardLayout';

export default function FeedbackScreen() {
  const { t } = useTranslation();
  const route = useRoute();
  const source = (route.params as { source?: string } | undefined)?.source;
  const keyboardOffset = useKeyboardOffset();
  return (
    <KeyboardAvoidingView className="flex-1 bg-theme-neutrals-1000" behavior="padding" keyboardVerticalOffset={keyboardOffset}>
      <ScreenHeader title={t('stats.feedback.title', 'Feedback')} icon="messages" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 4, paddingBottom: 40 }}>
        <FeedbackSection source={source === 'converter' || source === 'migration' ? source : undefined} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
