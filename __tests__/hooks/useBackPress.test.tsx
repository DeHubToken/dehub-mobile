import React from 'react';
import { BackHandler } from 'react-native';
import { act, create } from 'react-test-renderer';
import { NavigationContext } from '@react-navigation/native';
import { useBackPress } from '../../hooks/useBackPress';

type Listener = () => boolean | null | undefined;
let listeners: Listener[] = [];

beforeEach(() => {
  listeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, fn) => {
    listeners.push(fn as Listener);
    return { remove: () => { listeners = listeners.filter((l) => l !== fn); } };
  });
});

afterEach(() => jest.restoreAllMocks());

/** What the app does: newest listener first, stop at the first that takes it. */
const pressBack = () => [...listeners].reverse().some((l) => l());

function Layer({ onBack, enabled }: { onBack: () => void; enabled?: boolean }) {
  useBackPress(onBack, enabled);
  return null;
}

const screen = (focused: boolean) => ({ isFocused: () => focused }) as never;

describe('useBackPress', () => {
  it('closes a layer on a focused screen', () => {
    const onBack = jest.fn();
    act(() => {
      create(
        <NavigationContext.Provider value={screen(true)}>
          <Layer onBack={onBack} />
        </NavigationContext.Provider>,
      );
    });
    expect(pressBack()).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('leaves the press to the screen in front when its own screen is covered', () => {
    const onBack = jest.fn();
    act(() => {
      create(
        <NavigationContext.Provider value={screen(false)}>
          <Layer onBack={onBack} />
        </NavigationContext.Provider>,
      );
    });
    expect(pressBack()).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('does nothing while disabled, and always handles outside a navigator', () => {
    const off = jest.fn();
    const outside = jest.fn();
    act(() => {
      create(
        <>
          <Layer onBack={off} enabled={false} />
          <Layer onBack={outside} />
        </>,
      );
    });
    expect(pressBack()).toBe(true);
    expect(off).not.toHaveBeenCalled();
    expect(outside).toHaveBeenCalledTimes(1);
  });
});
