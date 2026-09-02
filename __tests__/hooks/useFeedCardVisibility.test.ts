import { renderHook, act } from '@testing-library/react-native';
import type { ViewToken } from 'react-native';

// The real module pulls the whole feed service graph in for two predicates.
jest.mock('../../services/feed.unified.service', () => ({
  isVideoItem: (item: any) => !item?.postType || item.postType === 'video',
  isLiveItem: (item: any) => item?.postType === 'live',
}));

import useFeedCardVisibility from '../../hooks/useFeedCardVisibility';

type Row = { __listKey: string; postType?: string };

const video = (key: string): Row => ({ __listKey: key, postType: 'video' });
const text = (key: string): Row => ({ __listKey: key, postType: 'text' });
const live = (key: string): Row => ({ __listKey: key, postType: 'live' });

const token = (item: Row, index: number, isViewable: boolean): ViewToken =>
  ({ item, index, isViewable, key: item.__listKey } as unknown as ViewToken);

/** What FlatList hands the hook: everything currently viewable, plus deltas. */
const report = (rows: Array<[Row, number, boolean]>) => {
  const tokens = rows.map(([item, index, isViewable]) =>
    token(item, index, isViewable),
  );
  return {
    viewableItems: tokens.filter((t) => t.isViewable),
    changed: tokens,
  };
};

describe('hooks/useFeedCardVisibility', () => {
  it('reports every viewable row as visible, not just the autoplay one', () => {
    const a = video('a');
    const b = video('b');
    const { result } = renderHook(() => useFeedCardVisibility());

    act(() => {
      result.current.onViewableItemsChanged(report([[a, 0, true], [b, 1, true]]));
    });

    // The bug: the second video on screen was told it was off screen, so it
    // could not attach a media source and tapping it did nothing at all.
    expect(result.current.isItemVisible('a')).toBe(true);
    expect(result.current.isItemVisible('b')).toBe(true);
  });

  it('hands autoplay to exactly one row — the topmost video', () => {
    const a = video('a');
    const b = video('b');
    const { result } = renderHook(() => useFeedCardVisibility());

    act(() => {
      result.current.onViewableItemsChanged(report([[a, 0, true], [b, 1, true]]));
    });

    expect(result.current.isItemAutoplayActive('a')).toBe(true);
    expect(result.current.isItemAutoplayActive('b')).toBe(false);
  });

  it('skips non-video rows when picking the autoplay row', () => {
    const note = text('note');
    const clip = video('clip');
    const { result } = renderHook(() => useFeedCardVisibility());

    act(() => {
      result.current.onViewableItemsChanged(
        report([[note, 0, true], [clip, 1, true]]),
      );
    });

    // Sorting over every viewable row gave the slot to the text post above the
    // video, and then nothing autoplayed at all.
    expect(result.current.isItemAutoplayActive('note')).toBe(false);
    expect(result.current.isItemAutoplayActive('clip')).toBe(true);
    expect(result.current.isItemVisible('note')).toBe(true);
  });

  it('moves autoplay on and drops visibility as rows scroll away', () => {
    const a = video('a');
    const b = video('b');
    const { result } = renderHook(() => useFeedCardVisibility());

    act(() => {
      result.current.onViewableItemsChanged(report([[a, 0, true], [b, 1, true]]));
    });
    act(() => {
      result.current.onViewableItemsChanged(report([[a, 0, false], [b, 1, true]]));
    });

    expect(result.current.isItemVisible('a')).toBe(false);
    expect(result.current.isItemAutoplayActive('a')).toBe(false);
    expect(result.current.isItemAutoplayActive('b')).toBe(true);
  });

  it('hands autoplay to a live row, which also holds a player', () => {
    const stream = live('stream');
    const { result } = renderHook(() => useFeedCardVisibility());

    act(() => {
      result.current.onViewableItemsChanged(report([[stream, 0, true]]));
    });

    // postType is "live", not "video", so the type filter used to exclude it
    // and no live card was ever handed autoplay in a feed that tracks
    // visibility — the stream sat behind its poster while it was on air.
    expect(result.current.isItemAutoplayActive('stream')).toBe(true);
  });

  it('does not let a text row above a live row take the slot', () => {
    const note = text('note');
    const stream = live('stream');
    const { result } = renderHook(() => useFeedCardVisibility());

    act(() => {
      result.current.onViewableItemsChanged(
        report([[note, 0, true], [stream, 1, true]]),
      );
    });

    expect(result.current.isItemAutoplayActive('note')).toBe(false);
    expect(result.current.isItemAutoplayActive('stream')).toBe(true);
  });

  it('leaves nothing autoplaying when no video row is viewable', () => {
    const note = text('note');
    const { result } = renderHook(() => useFeedCardVisibility());

    act(() => {
      result.current.onViewableItemsChanged(report([[note, 0, true]]));
    });

    expect(result.current.isItemAutoplayActive('note')).toBe(false);
  });

  it('resolves keys through a supplied keyExtractor', () => {
    const rowA = { id: 7 } as unknown as Row;
    const { result } = renderHook(() =>
      useFeedCardVisibility((item: any, index: number) => `row-${item.id}-${index}`),
    );

    act(() => {
      result.current.onViewableItemsChanged(report([[rowA, 0, true]]));
    });

    expect(result.current.isItemVisible('row-7-0')).toBe(true);
    // No postType at all still counts as a video row, matching isVideoItem.
    expect(result.current.isItemAutoplayActive('row-7-0')).toBe(true);
  });
});
