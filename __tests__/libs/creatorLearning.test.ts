import { CREATOR_LESSONS, gradeLearningAnswer, learningExerciseDraft, learningProgress } from '../../libs/creatorLearning';

it('grades only known lessons and normalizes account progress without fabricated achievements', () => {
  expect(learningProgress(['campaign', 'brief', 'brief', 'unknown'])).toEqual(['brief', 'campaign']);
  expect(learningProgress({ complete: true })).toEqual([]);
  for (const lesson of CREATOR_LESSONS) for (const answer of [0, 1, 2]) expect(gradeLearningAnswer(lesson.id, answer)).toBe(answer === lesson.correct);
  for (const answer of ['0', null, -1, 0.5, 3]) expect(gradeLearningAnswer('brief', answer)).toBe(false);
  expect(gradeLearningAnswer('unknown', 0)).toBe(false);
});
it('prepares separate stable editable exercise scopes with the actual medium and owner', () => {
  for (const lesson of CREATOR_LESSONS) {
    const draft = learningExerciseDraft(lesson.id, key => `Example: ${key}`, 'alice');
    expect(draft).toMatchObject({ owner: 'alice', kind: lesson.kind, aspect: lesson.aspect, workspaceId: `learn-${lesson.id}`, draftId: `learn-${lesson.id}-v1` });
    expect(draft?.prompt).toContain(`creator.learn.${lesson.id}.exercise`);
    expect(draft).not.toHaveProperty('references');
    expect(draft).not.toHaveProperty('jobId');
    if (lesson.kind === 'video') expect(draft?.durationSeconds).toBe(5);
  }
  expect(learningExerciseDraft('unknown', key => key, 'alice')).toBeNull();
  expect(learningExerciseDraft('brief', key => key, null)).not.toHaveProperty('owner');
});
