import { projectEditGate } from "./projectEditGate";
import { useEffect, useRef, useState } from "react";
import type { ProjectSnapshot } from "./types";
import { rebaseProjectHistory, mergeLocalProjectEdits } from "./projectHistory";
import { projectCommandHistory } from "./projectCommandHistory";
import { projectReviewSnapshotKey } from "./cloudProjectReview";
const HISTORY_LIMIT = 50;

export function useProjectHistory(initial: ProjectSnapshot | null, onChange?: (snapshot: ProjectSnapshot) => void) {
  const [project, setProject] = useState<ProjectSnapshot | null>(initial);
  const publish = (snapshot: ProjectSnapshot) => { onChange?.(snapshot); setProject(snapshot); };
  const past = useRef<ProjectSnapshot[]>([]);
  const future = useRef<ProjectSnapshot[]>([]);
  const commandObservers = useRef(new Set<() => void>());
  const observeCommands = () => { for (const observe of commandObservers.current) observe(); };
  const liveBase = useRef<ProjectSnapshot | null>(null);
  const current = useRef(project);
  current.current = project;
  const [, bump] = useState(0);
  const gate = useRef<ReturnType<typeof projectEditGate> | null>(null);
  if (!gate.current) gate.current = projectEditGate(() => { observeCommands(); bump(n => n + 1); });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; gate.current!.reset(false); observeCommands(); commandObservers.current.clear(); };
  }, []);

  const push = (before: ProjectSnapshot) => {
    past.current = [...past.current, before].slice(-HISTORY_LIMIT);
    future.current = [];
    observeCommands();
  };
  const commit = (next: ProjectSnapshot) => {
    const before = liveBase.current ?? current.current;
    liveBase.current = null;
    if (before) push(before);
    current.current = next; publish(next);
  };

  return {
    project,
    /** The project as of now, for work that finishes after an await. */
    latest: () => current.current,
    isEditing: () => !!liveBase.current || gate.current!.isEditing(),
    holdEdits: (expectedKey?: string) => {
      if (!mounted.current || !current.current || (expectedKey !== undefined && projectReviewSnapshotKey(current.current) !== expectedKey)) return null;
      return gate.current!.hold();
    },
    beginCommand: (expectedKey: string) => {
      const base = current.current;
      if (!mounted.current || !base || liveBase.current || projectReviewSnapshotKey(base) !== expectedKey) return null;
      const lease = gate.current!.hold();
      const group = projectCommandHistory<ProjectSnapshot>({
        read: () => ({ current: current.current!, past: past.current, future: future.current }),
        snapshot: value => value, entry: value => value,
        write: value => { past.current = value.past; future.current = value.future; observeCommands(); bump(n => n + 1); },
        isCurrent: () => mounted.current && lease.isCurrent() && current.current?.id === base.id,
        limit: HISTORY_LIMIT,
      });
      const observe = () => { group.isCurrent(); }; commandObservers.current.add(observe);
      const waiters = new Set<() => void>();
      const ready = () => {
        if (!group.isCurrent()) return Promise.reject(new Error("The pending command changed or was undone"));
        if (!liveBase.current) return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
          const stop = () => { commandObservers.current.delete(settled); waiters.delete(cancel); };
          const cancel = () => { stop(); reject(new Error("The pending command changed or was undone")); };
          const settled = () => { if (!group.isCurrent()) cancel(); else if (!liveBase.current) { stop(); resolve(); } };
          waiters.add(cancel); commandObservers.current.add(settled);
        });
      };
      return {
        isCurrent: group.isCurrent,
        ready,
        capture: <Result,>(write: () => Result): Result => {
          if (liveBase.current) throw new Error("Finish the active adjustment before applying this command");
          return group.capture(write);
        },
        commit: (source: ProjectSnapshot, proposed: ProjectSnapshot) => {
          if (!group.isCurrent() || liveBase.current) return false;
          const now = current.current!;
          const result = mergeLocalProjectEdits(source, now, proposed);
          if (!result.snapshot) return false;
          group.capture(() => commit(result.snapshot!)); return true;
        },
        release: () => { for (const cancel of [...waiters]) cancel(); commandObservers.current.delete(observe); lease.release(); },
      };
    },
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    reset: (p: ProjectSnapshot) => { gate.current!.reset(false); past.current = []; future.current = []; liveBase.current = null; current.current = p; observeCommands(); publish(p); },
    fork: (original: ProjectSnapshot, next: ProjectSnapshot) => {
      gate.current!.reset(false);
      past.current = [{ ...original, id: next.id, title: next.title }]; future.current = []; liveBase.current = null; current.current = next; publish(next);
      observeCommands();
    },
    receive: (snapshot: ProjectSnapshot, expectedKey: string) => {
      const before = current.current;
      if (!before || liveBase.current || gate.current!.isEditing() || projectReviewSnapshotKey(before) !== expectedKey) throw new Error("The current project changed during transfer");
      const next = rebaseProjectHistory({current:before,past:past.current,future:future.current},snapshot);
      past.current = next.past; future.current = next.future; current.current = next.current; publish(next.current);
      return next.protectedPaths.length;
    },
    /** Not an undo step: facts the canvas measured, like a video's real length. */
    replace: (p: ProjectSnapshot) => {
      if (p.id !== current.current?.id) return;
      if (liveBase.current && current.current) {
        const rebased = rebaseProjectHistory({current:current.current,past:[liveBase.current],future:[]},p);
        liveBase.current = rebased.past[0] ?? p;
      }
      current.current = p; publish(p);
    },
    commit,
    live: (next: ProjectSnapshot) => {
      if (next.id !== current.current?.id) return;
      if (!liveBase.current) liveBase.current = current.current;
      current.current = next; publish(next);
    },
    settle: () => {
      if (liveBase.current) {
        if (current.current && projectReviewSnapshotKey(liveBase.current) !== projectReviewSnapshotKey(current.current)) push(liveBase.current);
        liveBase.current = null; bump((n) => n + 1);
        observeCommands();
      }
    },
    undo: () => {
      const prev = past.current[past.current.length - 1];
      if (!prev || !current.current) return;
      past.current = past.current.slice(0, -1);
      observeCommands();
      future.current = [current.current, ...future.current];
      current.current = prev; publish(prev);
    },
    redo: () => {
      const next = future.current[0];
      if (!next || !current.current) return;
      future.current = future.current.slice(1);
      past.current = [...past.current, current.current];
      observeCommands();
      current.current = next; publish(next);
    },
  };
}
