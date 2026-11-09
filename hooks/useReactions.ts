import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ReactionFlowQueue, REACTION_STEP_MS, type ReactionParticle } from '../libs/live-reaction-flow';

/**
 * A live's floating reactions, kept outside React state.
 *
 * The particles used to sit in the live screen's own state, stepped every
 * 140ms while anything was in the air, so a busy room re-rendered the whole
 * viewer (player, chat, top bar) seven times a second for as long as the
 * applause lasted. The flow now steps on its own, and only the overlay that
 * draws the emoji listens to it.
 */
export interface ReactionFlow {
  add(type: unknown, weight?: number): void;
  remove(id: string): void;
  clear(): void;
  /** The particles in the air now: the same array until one comes or goes. */
  current(): ReactionParticle[];
  subscribe(listener: () => void): () => void;
}

const NONE: ReactionParticle[] = [];

function sameParticles(a: ReactionParticle[], b: ReactionParticle[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

export function createReactionFlow(now: () => number = Date.now): ReactionFlow {
  const queue = new ReactionFlowQueue();
  const listeners = new Set<() => void>();
  let particles = NONE;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const publish = (next: ReactionParticle[]) => {
    // Most steps only wait for particles to finish their climb.
    if (sameParticles(particles, next)) return;
    particles = next.length ? next : NONE;
    listeners.forEach((listener) => listener());
  };
  const step = () => {
    publish(queue.tick(now()));
    timer = queue.busy ? setTimeout(step, REACTION_STEP_MS) : null;
  };

  return {
    add(type, weight = 1) {
      queue.enqueue(type, weight);
      if (timer === null && queue.busy) step();
    },
    remove(id) {
      queue.remove(id);
      publish(particles.filter((item) => item.id !== id));
    },
    clear() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      queue.clear();
      publish(NONE);
    },
    current: () => particles,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * The screen's reaction flow. Adding to it re-renders nothing here: hand
 * `flow` to ReactionOverlay, which is the only thing that redraws.
 */
export function useReactions() {
  const [flow] = useState(createReactionFlow);
  useEffect(() => () => flow.clear(), [flow]);
  const addReaction = useCallback(
    (type: unknown, _username?: string, weight = 1) => flow.add(type, weight),
    [flow],
  );
  return { flow, addReaction, removeReaction: flow.remove, clearReactions: flow.clear };
}

/** The particles in the air, re-rendering only the component that asks. */
export function useReactionParticles(flow: ReactionFlow): ReactionParticle[] {
  return useSyncExternalStore(flow.subscribe, flow.current, flow.current);
}
