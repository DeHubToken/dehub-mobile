import React, { useState } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react-native';
import CreatorStudioControls from '../../components/Assistant/CreatorStudioControls';
import { CREATOR_DEFAULTS, creatorAudioOptions, type CreatorStudioSettings } from '../../libs/creatorStudio';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal', StyleSheet: { flatten: (style: unknown) => style } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/ui/Icon', () => () => null);
jest.mock('../../hooks/useSurfaceDraft', () => ({ useSurfaceDraft: (_field: string, initial: string) => {
  const [value, setter] = jest.requireActual<typeof import('react')>('react').useState(initial);
  return [value, Object.assign(setter, { initialize: (next: string) => setter(next) })];
} }));
let current: CreatorStudioSettings;
function Harness({ model = 'ace-step', disabled = false }: { model?: string; disabled?: boolean }) {
  const [settings, setSettings] = useState({ ...CREATOR_DEFAULTS.audio, model }); current = settings;
  return <CreatorStudioControls settings={settings} draftScope="project-a" onChange={setSettings} onMode={() => {}} onPresets={() => {}} disabled={disabled} />;
}
afterEach(cleanup);
it('edits a soundtrack length and lyrics and prepares those exact provider inputs', () => {
  const view = render(<Harness />);
  expect(view.getByLabelText('filters.duration').props.value).toBe('60');
  expect(view.getByLabelText('musicSheet.lyrics').props.placeholder).toBe('musicSheet.lyricsPlaceholder');
  fireEvent(view.getByLabelText('filters.duration'), 'focus');
  fireEvent.changeText(view.getByLabelText('filters.duration'), '21');
  fireEvent(view.getByLabelText('filters.duration'), 'blur');
  fireEvent.changeText(view.getByLabelText('musicSheet.lyrics'), '[verse]\nHello');
  expect(creatorAudioOptions(current, 'Quiet piano')).toEqual({ tags: 'Quiet piano', lyrics: '[verse]\nHello', duration: 21 });
  fireEvent.changeText(view.getByLabelText('musicSheet.lyrics'), '');
  expect(creatorAudioOptions(current, 'Quiet piano')).toMatchObject({ lyrics: '[instrumental]' });
});
it('keeps soundtrack controls out of the speech workspace', () => {
  const view = render(<Harness model="dia-tts" />);
  expect(view.queryByLabelText('filters.duration')).toBeNull();
  expect(view.queryByLabelText('musicSheet.lyrics')).toBeNull();
});
it('disables soundtrack fields during generation', () => {
  const view = render(<Harness disabled />);
  expect(view.getByLabelText('filters.duration').props.editable).toBe(false);
  expect(view.getByLabelText('musicSheet.lyrics').props.editable).toBe(false);
});
