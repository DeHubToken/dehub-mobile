import { getStageRecordingLanguage, setStageRecordingLanguage, setStageRecordingDubStatus, STAGE_RECORDING_LANGUAGES } from '../../libs/stage-recording-language';
import { hasCachedDubLanguage } from '../../libs/cached-dub-languages';

it('retains spoken language independently of the transcript sheet', () => {
  setStageRecordingLanguage('town-hall', 'es');
  setStageRecordingDubStatus('town-hall', 'es', 'ready');
  expect(getStageRecordingLanguage('town-hall')).toEqual({ language: 'es', status: 'ready' });
  expect(getStageRecordingLanguage('other-stage').language).toBe('original');
});
it('ignores late results for a language that is no longer selected', () => {
  setStageRecordingLanguage('switch', 'es');
  setStageRecordingLanguage('switch', 'fr');
  setStageRecordingDubStatus('switch', 'es', 'ready');
  expect(getStageRecordingLanguage('switch')).toEqual({ language: 'fr', status: 'preparing' });
});
it('offers cached spoken audio for every language in the picker', () => {
  expect(STAGE_RECORDING_LANGUAGES.every(([code]) => hasCachedDubLanguage(code))).toBe(true);
});
