import React from 'react';
import { render } from '@testing-library/react-native';
import ProtectedAudioPostPlayer from '../../components/Home/ProtectedAudioPostPlayer';
const mockQuery = { data: undefined as { url: string } | undefined, isError: false, refetch: jest.fn() };
jest.mock('dehub-jsx/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('@tanstack/react-query', () => ({ useQuery: () => mockQuery }));
jest.mock('../../libs', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../../context/AuthContext', () => ({ useUser: () => ({ address: 'buyer' }) }));
jest.mock('../../components/ui/Icon', () => ({ __esModule: true, default: () => null }));
jest.mock('../../components/Home/AudioPostPlayer', () => ({ __esModule: true,
  default: (props: any) => require('react').createElement(require('react-native').View, { testID: 'player', ...props }),
}));
const props = { tokenId: '123', audioUrl: 'https://example.test/original.mp3', isVisible: true };
beforeEach(() => { mockQuery.data = undefined; mockQuery.isError = false; });
it('never loads a protected original while permission is pending or denied', () => {
  const screen = render(<ProtectedAudioPostPlayer {...props} requiresAccess />);
  expect(screen.queryByTestId('player')).toBeNull();
  mockQuery.isError = true;
  screen.rerender(<ProtectedAudioPostPlayer {...props} requiresAccess />);
  expect(screen.queryByTestId('player')).toBeNull();
});
it('passes only the granted source to the existing purchased player', () => {
  mockQuery.data = { url: 'https://example.test/scoped-playback' };
  const screen = render(<ProtectedAudioPostPlayer {...props} requiresAccess />);
  expect(screen.getByTestId('player').props.audioUrl).toBe(mockQuery.data.url);
});
it('preserves the public audio source', () => {
  const screen = render(<ProtectedAudioPostPlayer {...props} requiresAccess={false} />);
  expect(screen.getByTestId('player').props.audioUrl).toBe(props.audioUrl);
});
