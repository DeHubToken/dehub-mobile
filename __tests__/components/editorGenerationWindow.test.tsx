import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import GenerationWindow from '../../components/editor/GenerationWindow';
import { importGeneratedMedia } from '../../libs/editor/importGeneratedMedia';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', KeyboardAvoidingView: 'KeyboardAvoidingView',
  StyleSheet: { flatten: (s: unknown) => s }, useWindowDimensions: () => ({ width: 400, height: 800 }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 20 }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }) }));
jest.mock('../../libs/editor/importGeneratedMedia', () => ({ importGeneratedMedia: jest.fn().mockResolvedValue({ id: 'media' }) }));
jest.mock('../../libs/toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn() }));
jest.mock('../../components/editor/TurntableRecorder', () => () => null);
jest.mock('../../screens/AIChatScreen', () => ({ CreatorStudioScreen: ({ onGenerated, onUseGenerated }: { onGenerated: (value: unknown) => void; onUseGenerated: (url: string, kind: string) => void }) => {
  const { Pressable, Text } = jest.requireMock('react-native');
  return <><Pressable onPress={() => onGenerated({ kind: 'video', url: 'https://media/video.mp4' })}><Text>Create</Text></Pressable>
    <Pressable onPress={() => onUseGenerated('https://media/video.mp4', 'video')}><Text>Edit</Text></Pressable></>;
} }));
afterEach(cleanup);
beforeEach(() => jest.clearAllMocks());

it('minimizes and reopens the same studio and imports completed output into uploads', async () => {
  const onState = jest.fn();
  const onAdd = jest.fn();
  const view = render(<GenerationWindow state="open" draft={null} onState={onState} onAdd={onAdd} />);
  fireEvent.press(view.getByLabelText('calls.minimize'));
  expect(onState).toHaveBeenCalledWith('minimized');
  view.rerender(<GenerationWindow state="minimized" draft={null} onState={onState} onAdd={onAdd} />);
  fireEvent.press(view.getByLabelText('Generate content'));
  expect(onState).toHaveBeenCalledWith('open');
  view.rerender(<GenerationWindow state="open" draft={null} onState={onState} onAdd={onAdd} />);
  await act(async () => { fireEvent.press(view.getByText('Create')); });
  expect(importGeneratedMedia).toHaveBeenCalledWith({ kind: 'video', url: 'https://media/video.mp4' }, expect.anything());
  await act(async () => { fireEvent.press(view.getByText('Edit')); });
  expect(onAdd).toHaveBeenCalledWith({ id: 'media' });
  expect(importGeneratedMedia).toHaveBeenCalledTimes(1);
});
