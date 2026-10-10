import { useRef, useState } from "react";
import type { ProjectSnapshot } from "./types";
import { rebaseProjectHistory } from "./projectHistory";
import { projectReviewSnapshotKey } from "./cloudProjectReview";
const HISTORY_LIMIT = 50;

export function useProjectHistory(initial: ProjectSnapshot | null) {
  const [project, setProject] = useState<ProjectSnapshot | null>(initial);
  const past = useRef<ProjectSnapshot[]>([]);
  const future = useRef<ProjectSnapshot[]>([]);
  const liveBase = useRef<ProjectSnapshot | null>(null);
  const current = useRef(project);
  current.current = project;
  const [, bump] = useState(0);

  const push = (before: ProjectSnapshot) => {
    past.current = [...past.current, before].slice(-HISTORY_LIMIT);
    future.current = [];
  };

  return {
    project,
    /** The project as of now, for work that finishes after an await. */
    latest: () => current.current,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    reset: (p: ProjectSnapshot) => { past.current = []; future.current = []; liveBase.current = null; current.current = p; setProject(p); },
    fork: (original: ProjectSnapshot, next: ProjectSnapshot) => {
      past.current = [{ ...original, id: next.id, title: next.title }]; future.current = []; liveBase.current = null; current.current = next; setProject(next);
    },
    receive: (snapshot: ProjectSnapshot, expectedKey: string) => {
      const before = current.current;
      if (!before || liveBase.current || projectReviewSnapshotKey(before) !== expectedKey) throw new Error("The current project changed during transfer");
      const next = rebaseProjectHistory({current:before,past:past.current,future:future.current},snapshot);
      past.current = next.past; future.current = next.future; current.current = next.current; setProject(next.current);
      return next.protectedPaths.length;
    },
    /** Not an undo step: facts the canvas measured, like a video's real length. */
    replace: (p: ProjectSnapshot) => { if (liveBase.current) liveBase.current = p; current.current = p; setProject(p); },
    commit: (next: ProjectSnapshot) => {
      const before = liveBase.current ?? current.current;
      liveBase.current = null;
      if (before) push(before);
      current.current = next; setProject(next);
    },
    live: (next: ProjectSnapshot) => {
      if (!liveBase.current) liveBase.current = current.current;
      current.current = next; setProject(next);
    },
    settle: () => {
      if (liveBase.current) { push(liveBase.current); liveBase.current = null; bump((n) => n + 1); }
    },
    undo: () => {
      const prev = past.current[past.current.length - 1];
      if (!prev || !current.current) return;
      past.current = past.current.slice(0, -1);
      future.current = [current.current, ...future.current];
      current.current = prev; setProject(prev);
    },
    redo: () => {
      const next = future.current[0];
      if (!next || !current.current) return;
      future.current = future.current.slice(1);
      past.current = [...past.current, current.current];
      current.current = next; setProject(next);
    },
  };
}
