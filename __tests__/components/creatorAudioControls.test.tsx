import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', TextInput: 'TextInput',
  StyleSheet: { create: (styles: unknown) => styles, flatten: (styles: unknown) => styles },
}));

let mockOwner = 'alice';
const mockPick = jest.fn();
jest.mock('../../context/AuthContext', () => ({ useUser: () => ({ walletAddress: mockOwner }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...args: unknown[]) => mockPick(...args) }));
jest.mock('../../libs/toast', () => ({ toastError: jest.fn() }));

import { CreatorAudioControls } from '../../components/Assistant/CreatorAudioControls';

const recording = { canceled: false, assets: [{ uri: 'file:///recording.mp3', name: 'recording.mp3', mimeType: 'audio/mpeg', size: 100 }] };
beforeEach(() => { mockOwner = 'alice'; mockPick.mockReset(); });

it('does not apply a picker result to a different task, conversation or account', async () => {
  for (const change of ['task', 'conversation', 'account']) {
    let complete!: (value: typeof recording) => void;
    mockPick.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const onChange = jest.fn();
    const original = { task: 'transcribe' as const };
    const view = render(<CreatorAudioControls value={original} onChange={onChange} text="" disabled={false} scopeKey="one" />);
    fireEvent.press(view.getByText('creator.audioAttach'));
    if (change === 'account') mockOwner = 'bob';
    view.rerender(<CreatorAudioControls value={change === 'task' ? { task: 'isolate' } : original} onChange={onChange} text="" disabled={false} scopeKey={change === 'conversation' ? 'two' : 'one'} />);
    await act(async () => { complete(recording); });
    expect(onChange).not.toHaveBeenCalled();
    view.unmount();
    mockOwner = 'alice';
  }
});

it('attaches a valid recording to the unchanged draft', async () => {
  mockPick.mockResolvedValue(recording);
  const onChange = jest.fn();
  const view = render(<CreatorAudioControls value={{ task: 'transcribe' }} onChange={onChange} text="" disabled={false} scopeKey="one" />);
  await act(async () => { fireEvent.press(view.getByText('creator.audioAttach')); });
  expect(onChange).toHaveBeenCalledWith({ task: 'transcribe', media: recording.assets[0] });
});
