/**
 * A busy live re-rendered the whole viewer seven times a second while
 * reactions were in the air: the particles lived in the screen's state. They
 * now live in a flow only the overlay listens to.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { createReactionFlow, useReactionParticles, useReactions, type ReactionFlow } from '../../hooks/useReactions';
import { REACTION_MOTION, REACTION_STEP_MS } from '../../libs/live-reaction-flow';

jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('reaction flow', () => {
  it('steps on its own and tells listeners only when a particle comes or goes', () => {
    let clock = 0;
    const flow = createReactionFlow(() => clock);
    const heard = jest.fn();
    flow.subscribe(heard);

    flow.add('HEART');
    expect(flow.current()).toHaveLength(1);
    expect(heard).toHaveBeenCalledTimes(1);

    // Three hearts go up, one per step.
    for (let i = 0; i < 2; i++) {
      clock += REACTION_STEP_MS;
      jest.advanceTimersByTime(REACTION_STEP_MS);
    }
    expect(flow.current()).toHaveLength(3);
    expect(heard).toHaveBeenCalledTimes(3);

    // While they climb nothing changes, and nobody is told.
    const climbing = flow.current();
    clock += REACTION_STEP_MS;
    jest.advanceTimersByTime(REACTION_STEP_MS);
    expect(flow.current()).toBe(climbing);
    expect(heard).toHaveBeenCalledTimes(3);

    // Once the last one has finished, the flow stops stepping.
    clock += REACTION_MOTION.HEART.duration;
    jest.advanceTimersByTime(REACTION_MOTION.HEART.duration);
    expect(flow.current()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears everything in the air and stops', () => {
    const flow = createReactionFlow(() => 0);
    flow.add('HOT', 14);
    flow.clear();
    expect(flow.current()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops telling a listener that left', () => {
    const flow = createReactionFlow(() => 0);
    const heard = jest.fn();
    const leave = flow.subscribe(heard);
    leave();
    flow.add('LIKE');
    expect(heard).not.toHaveBeenCalled();
  });
});

describe('a live screen with reactions flying', () => {
  it('redraws only the overlay, not the screen', () => {
    const renders = { screen: 0, overlay: 0 };
    let add: (type: unknown) => void = () => undefined;

    const Overlay = React.memo(({ flow }: { flow: ReactionFlow }) => {
      renders.overlay += 1;
      useReactionParticles(flow);
      return null;
    });
    function Screen() {
      renders.screen += 1;
      const { flow, addReaction } = useReactions();
      add = addReaction;
      return <Overlay flow={flow} />;
    }

    const screen = render(<Screen />);
    act(() => {
      for (let i = 0; i < 20; i++) add(i % 2 ? 'LIKE' : 'HEART');
    });
    for (let i = 0; i < 30; i++) {
      act(() => {
        jest.advanceTimersByTime(REACTION_STEP_MS);
      });
    }

    expect(renders.screen).toBe(1);
    expect(renders.overlay).toBeGreaterThan(20);

    // Leaving the screen stops the flow's clock.
    screen.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
