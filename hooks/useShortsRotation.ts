import { useEffect, useMemo, useRef, useState } from 'react';
import { extendShortsDraw, readShortsHistory, rememberShorts, shortsId, type ShortsCandidate } from '../libs/shortsRotation';

export type ShortsHistoryStore = {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
};

type Draw = { visit: string; seed: string; recent: string[]; rows: string[][] };

export function useShortsRotation<T extends ShortsCandidate>(
  candidates: readonly T[], count: number, visit: string, historyKey: string,
  store: ShortsHistoryStore, ready: boolean, exhausted: boolean,
) {
  const [draw, setDraw] = useState<Draw | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    const sequenceId = ++sequence.current;
    void store.read(historyKey).catch(() => null).then(raw => {
      if (sequence.current !== sequenceId) return;
      setDraw({ visit, seed: `${Date.now()}:${Math.random()}`, recent: readShortsHistory(raw), rows: [] });
    });
    return () => { sequence.current++; };
  }, [visit, historyKey, store]);

  useEffect(() => {
    if (!ready || !draw || draw.visit !== visit) return;
    const rows = extendShortsDraw(draw.rows, candidates, count, draw.seed, draw.recent, exhausted);
    if (rows.length === draw.rows.length) return;
    setDraw({ ...draw, rows });
    void store.write(historyKey, JSON.stringify(rememberShorts(draw.recent, rows))).catch(() => {});
  }, [candidates, count, ready, exhausted, draw, visit, historyKey, store]);

  const batches = useMemo(() => {
    if (!draw || draw.visit !== visit) return [];
    const byId = new Map(candidates.map(item => [shortsId(item), item]));
    return draw.rows.map(row => row.flatMap(id => {
      const item = byId.get(id);
      return item ? [item] : [];
    }));
  }, [candidates, draw, visit]);
  const allocated = draw?.visit === visit ? draw.rows.flat().length : 0;
  return { batches, allocated, generation: draw?.seed ?? visit };
}
