import type { GenerationDraft } from './editor/generationDraft';

export const CREATOR_LESSONS = [
  { id: 'brief', correct: 0, kind: 'image', aspect: '1:1' },
  { id: 'continuity', correct: 1, kind: 'video', aspect: '16:9' },
  { id: 'campaign', correct: 2, kind: 'image', aspect: '4:5' },
] as const;
export type CreatorLessonId = typeof CREATOR_LESSONS[number]['id'];
export const lessonKey = (id: CreatorLessonId, field: string) => `creator.learn.${id}.${field}`;
export function learningProgress(value: unknown): CreatorLessonId[] {
  return CREATOR_LESSONS.filter(lesson => Array.isArray(value) && value.includes(lesson.id)).map(lesson => lesson.id);
}
export function gradeLearningAnswer(id: string, answer: unknown): boolean {
  return Number.isInteger(answer) && CREATOR_LESSONS.some(lesson => lesson.id === id && lesson.correct === answer);
}
/** Opening the exercise is free; the existing studio owns authentication, review and payment. */
export function learningExerciseDraft(id: string, translate: (key: string) => string, owner?: string | null): GenerationDraft | null {
  const lesson = CREATOR_LESSONS.find(item => item.id === id);
  if (!lesson) return null;
  return { kind: lesson.kind, aspect: lesson.aspect, prompt: translate(lessonKey(lesson.id, 'exercise')),
    ...(lesson.kind === 'video' ? { durationSeconds: 5 } : {}), ...(owner ? { owner } : {}),
    workspaceId: `learn-${lesson.id}`, draftId: `learn-${lesson.id}-v1` };
}
