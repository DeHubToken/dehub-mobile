import React from 'react';
import { act, create } from 'react-test-renderer';
import { NavigationContext } from '@react-navigation/native';
import { useBackPress } from '../../hooks/useBackPress';

type Listener = () => boolean;
let mockListeners: Listener[] = [];

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  BackHandler: {
    addEventListener: (_event: string, fn: Listener) => {
      mockListeners.push(fn);
      return { remove: () => { mockListeners = mockListeners.filter((l) => l !== fn); } };
    },
  },
}));
jest.mock('@react-navigation/native', () => ({ NavigationContext: require('react').createContext(undefined) }));

beforeEach(() => { mockListeners = []; });

/** What the app does: newest listener first, stop at the first that takes it. */
const pressBack = () => [...mockListeners].reverse().some((l) => l());

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
