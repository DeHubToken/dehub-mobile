import { useCallback, useRef, useState } from 'react';
import type { FloatingReaction, ReactionType } from '../components/LiveProducer/ReactionOverlay';

const nowId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export interface UseReactionsResult {
  reactions: FloatingReaction[];
  addReaction: (type: ReactionType, username?: string) => void;
  removeReaction: (id: string) => void;
  clearReactions: () => void;
}

export const useReactions = (maxConcurrent = 20): UseReactionsResult => {
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  const addReaction = useCallback((type: ReactionType, username?: string) => {
    const item: FloatingReaction = { id: nowId(), type, username };
    setReactions((prev) => [...prev, item].slice(-maxConcurrent));
  }, [maxConcurrent]);

  const removeReaction = useCallback((id: string) => {
    setReactions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const clearReactions = useCallback(() => {
    setReactions([]);
  }, []);

  return { reactions, addReaction, removeReaction, clearReactions };
};
