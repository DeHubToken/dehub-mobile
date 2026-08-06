import { renderHook, act } from '@testing-library/react-native';
import { useAssistantPendingReply } from '../../hooks/useAssistantPendingReply';
import { ASSISTANT_ADDRESS } from '../../libs/assistant';

/** A comment as the thread stores it, only the fields the hook reads. */
const comment = (address: string, createdAt: Date) => ({
  address,
  createdAt: createdAt.toISOString(),
});

describe('hooks/useAssistantPendingReply', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is idle until armed', () => {
    const reload = jest.fn();
    const { result } = renderHook(() => useAssistantPendingReply(reload, []));

    expect(result.current.isWaiting).toBe(false);

    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it('waits and reloads once armed', () => {
    const reload = jest.fn();
    const { result } = renderHook(() => useAssistantPendingReply(reload, []));

    act(() => {
      result.current.arm();
    });
    expect(result.current.isWaiting).toBe(true);

    act(() => {
      jest.advanceTimersByTime(9_000);
    });
    expect(reload).toHaveBeenCalled();
  });

  it('gives up rather than spinning forever when the bot stays silent', () => {
    const reload = jest.fn();
    const { result } = renderHook(() => useAssistantPendingReply(reload, []));

    act(() => {
      result.current.arm();
    });

    act(() => {
      jest.advanceTimersByTime(46_000);
    });
    expect(result.current.isWaiting).toBe(false);
  });

  it('stops as soon as the assistant reply arrives', () => {
    const reload = jest.fn();
    let comments: ReturnType<typeof comment>[] = [];
    const { result, rerender } = renderHook(() =>
      useAssistantPendingReply(reload, comments),
    );

    act(() => {
      result.current.arm();
    });
    expect(result.current.isWaiting).toBe(true);

    comments = [comment(ASSISTANT_ADDRESS, new Date())];
    act(() => {
      rerender({});
    });

    expect(result.current.isWaiting).toBe(false);
  });

  it('ignores an assistant comment left over from an earlier question', () => {
    const reload = jest.fn();
    // Well outside the clock-skew allowance, so it cannot be this answer.
    const stale = [comment(ASSISTANT_ADDRESS, new Date(Date.now() - 600_000))];
    const { result, rerender } = renderHook(() =>
      useAssistantPendingReply(reload, stale),
    );

    act(() => {
      result.current.arm();
    });
    act(() => {
      rerender({});
    });

    expect(result.current.isWaiting).toBe(true);
  });

  it('ignores comments from everyone who is not the bot', () => {
    const reload = jest.fn();
    let comments: ReturnType<typeof comment>[] = [];
    const { result, rerender } = renderHook(() =>
      useAssistantPendingReply(reload, comments),
    );

    act(() => {
      result.current.arm();
    });

    comments = [comment('0x1111111111111111111111111111111111111111', new Date())];
    act(() => {
      rerender({});
    });

    expect(result.current.isWaiting).toBe(true);
  });
});
