import React, { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import ScreenHeader from '../components/ScreenHeader';
import { useSurfaceDraft } from '../hooks/useSurfaceDraft';
import { useUser } from '../context/AuthContext';
import { ScreenNames } from '../navigation/ScreenNames';
import type { AppStackParamList } from '../navigation/types';
import { CREATOR_LESSONS, gradeLearningAnswer, learningExerciseDraft, learningProgress, lessonKey } from '../libs/creatorLearning';

export default function CreatorLearningScreen() {
  const { t } = useTranslation(), user = useUser();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const route = useRoute<RouteProp<AppStackParamList, ScreenNames.CreatorLearning>>();
  const [selection, setSelection] = useSurfaceDraft<string>('creator.learning.lesson.v1', 'brief', 'learning');
  const [saved, setSaved] = useSurfaceDraft<string[]>('creator.learning.progress.v1', [], 'learning');
  const [answers, setAnswers] = useSurfaceDraft<Record<string, number>>('creator.learning.answers.v1', {}, 'learning');
  const [checked, setChecked] = useSurfaceDraft<Record<string, boolean>>('creator.learning.checked.v1', {}, 'learning');
  useEffect(() => { if (route.params?.lesson && CREATOR_LESSONS.some(item => item.id === route.params!.lesson)) setSelection(route.params.lesson); }, [route.params?.lesson, setSelection]);
  const lesson = CREATOR_LESSONS.find(item => item.id === selection) ?? CREATOR_LESSONS[0], progress = learningProgress(saved);
  const passed = progress.includes(lesson.id), answer = answers?.[lesson.id];
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} className="rounded-xl border border-theme-neutrals-500 px-4 py-3" style={{ opacity: disabled ? 0.4 : 1 }}><Text className="text-sm text-theme-neutrals-100">{label}</Text></Pressable>;
  return <View className="flex-1 bg-theme-neutrals-900">
    <ScreenHeader title={t('creator.learn.title')} />
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Text className="text-sm text-theme-neutrals-300">{t('creator.learn.intro')}</Text>
      <Text className="mt-2 text-xs text-theme-neutrals-400">{t('creator.learn.progress', { completed: progress.length, total: CREATOR_LESSONS.length })}</Text>
      <View className="my-5 gap-3">{CREATOR_LESSONS.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === lesson.id }} onPress={() => setSelection(item.id)} className="rounded-xl border border-theme-neutrals-600 px-4 py-3"><Text className="text-sm text-theme-neutrals-100">{index + 1}. {t(lessonKey(item.id, 'title'))}{progress.includes(item.id) ? ' ✓' : ''}</Text></Pressable>)}</View>
      <View className="rounded-3xl border border-theme-neutrals-700 p-4">
        <Text className="text-xl font-semibold text-theme-neutrals-100">{t(lessonKey(lesson.id, 'title'))}</Text>
        {[1, 2, 3].map(index => <Text key={index} className="mt-4 leading-6 text-theme-neutrals-300">{t(lessonKey(lesson.id, `body${index}`))}</Text>)}
        <Text className="mt-7 font-semibold text-theme-neutrals-100">{t(lessonKey(lesson.id, 'question'))}</Text>
        {[0, 1, 2].map(index => <Pressable key={index} accessibilityRole="radio" accessibilityState={{ checked: answer === index }} onPress={() => { setAnswers({ ...answers, [lesson.id]: index }); setChecked({ ...checked, [lesson.id]: false }); }} className="mt-3 rounded-xl border border-theme-neutrals-600 p-3"><Text className="text-sm text-theme-neutrals-100">{answer === index ? '● ' : '○ '}{t(lessonKey(lesson.id, `answer${index}`))}</Text></Pressable>)}
        <View className="mt-4">{button(t('creator.learn.check'), () => { const correct = gradeLearningAnswer(lesson.id, answer); setSaved(correct ? learningProgress([...progress, lesson.id]) : progress.filter(id => id !== lesson.id)); setChecked({ ...checked, [lesson.id]: true }); }, !Number.isInteger(answer))}</View>
        {checked?.[lesson.id] && <Text accessibilityLiveRegion="polite" className="mt-3 text-sm text-theme-neutrals-200">{t(passed ? 'creator.learn.correct' : 'creator.learn.retry')}</Text>}
        <Text className="mt-7 font-semibold text-theme-neutrals-100">{t('creator.learn.exerciseTitle')}</Text>
        <Text className="mt-2 text-sm text-theme-neutrals-300">{t('creator.learn.exerciseHint')}</Text>
        <Text className="my-3 rounded-xl border border-theme-neutrals-700 p-3 text-sm text-theme-neutrals-200">{t(lessonKey(lesson.id, 'exercise'))}</Text>
        {button(t('creator.learn.openExercise'), () => {
          const draft = learningExerciseDraft(lesson.id, key => t(key), user?.address ?? null);
          if (draft) navigation.navigate(ScreenNames.CreatorStudio, { mode: draft.kind === 'video' ? 'video' : 'image', editorDraft: draft, marketingHandoff: undefined, initialPrompt: undefined, workflow: undefined, clip: undefined, effect: undefined });
        })}
      </View>
    </ScrollView>
  </View>;
}
