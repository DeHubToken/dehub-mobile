import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import CreatorLibraryManager from '../../components/Assistant/CreatorLibraryManager';
const mockList = jest.fn(), mockUpdate = jest.fn(), mockInvalidate = jest.fn();
jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: (styles: unknown) => styles, flatten: (styles: unknown) => styles },
    Modal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? children : null,
    FlatList: (props: { data: unknown[]; renderItem(item: { item: unknown; index: number }): React.ReactNode }) =>
      React.createElement('FlatList', props, props.data.map((item, index) => React.createElement(React.Fragment, { key: index }, props.renderItem({ item, index })))),
  };
});
jest.mock('../../services/creator.service', () => ({ listCreatorAssets: (...args: unknown[]) => mockList(...args), updateCreatorSelection: (...args: unknown[]) => mockUpdate(...args) }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const rows = [{ id: 'first-asset', prompt: 'First take', hidden: false }, { id: 'second-asset', prompt: 'Second take', hidden: false }];
beforeEach(() => { jest.clearAllMocks(); mockList.mockResolvedValue({ jobs: rows, nextOffset: null }); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
it('retains incomplete selections and refreshes the correct private account library', async () => {
  mockUpdate.mockResolvedValue({ completedIds: ['first-asset'], incompleteIds: ['second-asset'] });
  const view = render(<CreatorLibraryManager wallet="owner" />);
  fireEvent.press(view.getByText('multiPost.manage'));
  await view.findByText('☐ First take');
  fireEvent.press(view.getByText('migrate.selectAll')); fireEvent.press(view.getByText('creator.libraryFavoriteAdd'));
  await view.findByText('1/100');
  expect(mockUpdate).toHaveBeenCalledWith(['first-asset', 'second-asset'], 'favorite', 'owner');
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['creator-library', 'owner'] });
  expect(view.getByText('☑ Second take')).toBeTruthy();
});
it('ignores a mutation completing after an account switch', async () => {
  let finish!: (value: unknown) => void;
  mockUpdate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<CreatorLibraryManager wallet="owner" />);
  fireEvent.press(view.getByText('multiPost.manage')); await view.findByText('☐ First take');
  fireEvent.press(view.getByText('migrate.selectAll')); fireEvent.press(view.getByText('editor.layers.hide'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  view.rerender(<CreatorLibraryManager wallet="new-owner" />);
  await act(async () => { finish({ completedIds: ['first-asset'], incompleteIds: [] }); });
  expect(mockInvalidate).not.toHaveBeenCalled();
  expect(view.getByText('0/100')).toBeTruthy();
});
it('lets the creator close the manager while a request is still pending', async () => {
  jest.useFakeTimers();
  mockList.mockImplementationOnce(() => new Promise(() => {}));
  const view = render(<CreatorLibraryManager wallet="owner" />);
  fireEvent.press(view.getByText('multiPost.manage'));
  fireEvent.press(view.getByText('common.close'));
  expect(view.queryByText('creator.referenceLibrary')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(30_000); });
  jest.useRealTimers();
});
it('loads the correct remaining page after hiding selected rows shifts the server offset', async () => {
  mockList.mockResolvedValueOnce({ jobs: rows, nextOffset: 2 });
  mockUpdate.mockResolvedValue({ completedIds: rows.map(row => row.id), incompleteIds: [] });
  const view = render(<CreatorLibraryManager wallet="owner" />);
  fireEvent.press(view.getByText('multiPost.manage')); await view.findByText('☐ First take');
  fireEvent.press(view.getByText('migrate.selectAll')); fireEvent.press(view.getByText('editor.layers.hide'));
  await view.findByText('0/100');
  mockList.mockResolvedValue({ jobs: [{ id: 'remaining-asset', prompt: 'Remaining take', hidden: false }], nextOffset: null });
  fireEvent(view.UNSAFE_getByType(FlatList), 'onEndReached');
  await view.findByText('☐ Remaining take');
  expect(mockList).toHaveBeenLastCalledWith(0, { hidden: false, favorites: false });
});
