import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactionFlowQueue, REACTION_STEP_MS, type ReactionParticle } from '../libs/live-reaction-flow';

export function useReactions() {
  const queue = useRef(new ReactionFlowQueue());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reactions, setReactions] = useState<ReactionParticle[]>([]);
  const clearReactions = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    queue.current.clear();
    setReactions([]);
  }, []);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    queue.current.clear();
  }, []);
  const addReaction = useCallback((type: unknown, _username?: string, weight = 1) => {
    queue.current.enqueue(type, weight);
    if (timer.current !== null || !queue.current.busy) return;
    const step = () => {
      setReactions(queue.current.tick(Date.now()));
      timer.current = queue.current.busy ? setTimeout(step, REACTION_STEP_MS) : null;
    };
    step();
  }, []);
  const removeReaction = useCallback((id: string) => {
    queue.current.remove(id);
    setReactions(items => items.filter(item => item.id !== id));
  }, []);
  return { reactions, addReaction, removeReaction, clearReactions };
}
