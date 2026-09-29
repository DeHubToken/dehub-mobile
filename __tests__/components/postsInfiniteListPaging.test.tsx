import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));

// A FlatList that draws what the real one would: the rows (or the empty view)
// and then the footer. Its last props are kept so a test can reach the end.
let mockListProps: any = null;
jest.mock('react-native', () => {
  const R = require('react');
  const slot = (c: any) => (c == null ? null : R.isValidElement(c) ? c : R.createElement(c));
  return {
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    ActivityIndicator: 'ActivityIndicator',
    FlatList: (props: any) => {
      mockListProps = props;
      return R.createElement(
        'FlatList',
        null,
        props.data.length === 0
          ? slot(props.ListEmptyComponent)
          : props.data.map((item: any, index: number) =>
              R.createElement(R.Fragment, { key: index }, props.renderItem({ item, index })),
            ),
        slot(props.ListFooterComponent),
      );
    },
  };
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/Feed/DeHubRefreshControl', () => ({
  DeHubRefreshControl: () => null,
  DeHubRefreshMark: () => null,
}));
jest.mock('../../components/Home/FeedCard', () => (props: any) =>
  require('react').createElement('FeedCard', { id: props.item.id }),
);
jest.mock('../../components/Feed/FeedCardSkeleton', () => () =>
  require('react').createElement('Skeleton'),
);
jest.mock('../../components/ui/Icon', () => () => null);
jest.mock('../../hooks/useFeedCardVisibility', () => ({
  useFeedCardVisibility: () => ({
    viewabilityConfig: {},
    onViewableItemsChanged: () => {},
    isItemVisible: () => false,
    isItemAutoplayActive: () => false,
    visibilityExtraData: 0,
  }),
}));
jest.mock('../../services/bookmark.service', () => ({ getFolderItems: jest.fn() }));
jest.mock('../../services/user.service', () => ({
  getMyPosts: jest.fn(),
  getLikedPosts: jest.fn(),
  getSavedPosts: jest.fn(),
  getUnlockedPosts: jest.fn(),
  getWatchHistory: jest.fn(),
}));

import PostsInfiniteList from '../../components/Profile/PostsInfiniteList';
import { getSavedPosts } from '../../services/user.service';

const fetchSaved = getSavedPosts as jest.Mock;
const posts = (from: number, count: number) =>
  ({ result: Array.from({ length: count }, (_, i) => ({ id: `p${from + i}` })) }) as any;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const texts = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => n.type === 'Text').map((n) => n.props.children);
const spinners = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.type === 'ActivityIndicator');
const retryButton = (tree: ReactTestRenderer): ReactTestInstance =>
  tree.root.find(
    (n) => n.type === 'Pressable' && n.findAll((c) => c.type === 'Text' && c.props.children === 'common.retry').length > 0,
  );
const reachEnd = () => act(() => { mockListProps.onEndReached(); });

let tree: ReactTestRenderer;

beforeEach(() => {
  fetchSaved.mockReset();
  mockListProps = null;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  act(() => tree?.unmount());
  (console.warn as jest.Mock).mockRestore();
});

it('shows only the error and Retry when the first page fails, and never loads page 2 in its place', async () => {
  fetchSaved.mockRejectedValueOnce(new Error('offline'));
  act(() => { tree = create(<PostsInfiniteList variant="saved" />); });
  await flush();

  expect(texts(tree)).toContain('profile.couldNotLoadPosts');
  // No footer spinner under the error view.
  expect(spinners(tree).length).toBe(0);

  // The error view settling at the bottom must not fetch the next page.
  reachEnd();
  await flush();
  expect(fetchSaved).toHaveBeenCalledTimes(1);

  // Retry shows the skeleton while page 0 is fetched again.
  let resolveRetry!: (v: unknown) => void;
  fetchSaved.mockReturnValueOnce(new Promise((r) => { resolveRetry = r; }));
  act(() => { retryButton(tree).props.onPress(); });
  expect(tree.root.findAll((n) => n.type === 'Skeleton')).toHaveLength(1);
  expect(fetchSaved).toHaveBeenLastCalledWith({ page: 0, unit: 20 });

  await act(async () => { resolveRetry(posts(0, 20)); });
  expect(tree.root.findAll((n) => n.type === 'FeedCard')).toHaveLength(20);
});

it('puts a Retry row in the footer when a later page fails, and stops reaching the end on its own', async () => {
  fetchSaved.mockResolvedValueOnce(posts(0, 20));
  act(() => { tree = create(<PostsInfiniteList variant="saved" />); });
  await flush();

  // Spinner and Retry row share one fixed height, so swapping them does not
  // change the content length.
  const spinnerSlot = spinners(tree)[0].parent!;
  expect(spinnerSlot.props.style).toEqual(expect.objectContaining({ height: 56 }));

  fetchSaved.mockRejectedValueOnce(new Error('offline'));
  reachEnd();
  await flush();
  expect(fetchSaved).toHaveBeenLastCalledWith({ page: 1, unit: 20 });

  expect(spinners(tree).length).toBe(0);
  expect(texts(tree)).toEqual(expect.arrayContaining(['profile.couldNotLoadPosts', 'common.retry']));
  expect(retryButton(tree).props.style).toEqual(expect.objectContaining({ height: 56 }));
  expect(tree.root.findAll((n) => n.type === 'FeedCard')).toHaveLength(20);

  // Reaching the end again does not retry by itself.
  reachEnd();
  await flush();
  expect(fetchSaved).toHaveBeenCalledTimes(2);

  // Tapping Retry fetches the same page again and appends it.
  fetchSaved.mockResolvedValueOnce(posts(20, 5));
  act(() => { retryButton(tree).props.onPress(); });
  await flush();
  expect(fetchSaved).toHaveBeenCalledTimes(3);
  expect(fetchSaved).toHaveBeenLastCalledWith({ page: 1, unit: 20 });
  expect(tree.root.findAll((n) => n.type === 'FeedCard')).toHaveLength(25);
  expect(texts(tree)).not.toContain('common.retry');
});
