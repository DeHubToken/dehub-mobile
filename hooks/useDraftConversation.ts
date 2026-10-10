import { useCallback } from 'react';
import { useDraftState } from './useDraftState';

type Session = { id: string | null; draft: string; aliases: Record<string, string> };

/** A server-assigned id must not move the box while its first request is pending. */
export function useDraftConversation(surface = 'assistant') {
  const [session, setSession] = useDraftState<Session>(`${surface}:session`, { id: null, draft: 'new', aliases: {} });
  const assign = useCallback((id: string) => setSession(previous => ({
    ...previous, id: previous.draft === session.draft ? id : previous.id,
    aliases: Object.fromEntries([...Object.entries(previous.aliases).filter(([key]) => key !== id), [id, session.draft]].slice(-50)),
  })), [setSession, session.draft]);
  const select = useCallback((id: string) => setSession(previous => ({ ...previous, id, draft: previous.aliases[id] ?? id })), [setSession]);
  const start = useCallback(() => setSession(previous => ({
    ...previous, id: null, draft: `new:${Date.now()}:${Math.random().toString(36).slice(2)}`,
  })), [setSession]);
  return { id: session.id, draft: session.draft, assign, select, start };
}
