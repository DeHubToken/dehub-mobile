import { useEffect, useRef, useState } from "react";
import { projectReviewSnapshotKey } from "./cloudProjectReview";
import { projectTask } from "./projectTask";
import { updateClip } from "./project";
import type { ProjectEditLease } from "./projectEditGate";
import type { ProjectSnapshot, TextClip } from "./types";

type Draft = { task: NonNullable<ReturnType<typeof projectTask>>; projectId: string } & (
  { kind: "text"; clip: TextClip } | { kind: "title"; title: string }
);
interface Options {
  rendered: ProjectSnapshot | null;
  current(): ProjectSnapshot | null;
  holdEdits(expectedKey: string): ProjectEditLease | null;
  commit(snapshot: ProjectSnapshot): void;
}

export function useEditorProjectDraft(options: Options) {
  const latest = useRef(options); latest.current = options;
  const active = useRef<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const cancel = (frame: Draft | null) => {
    if (!frame || active.current !== frame) return;
    active.current = null; frame.task.release(); setDraft(null);
  };
  const open = (kind: "text" | "title", id?: string, source = options.rendered) => {
    if (!source) return false;
    const clip = kind === "text" ? source.clips.find(c => c.id === id) : null;
    if (kind === "text" && (!clip || clip.kind !== "text" || clip.locked)) return false;
    const lease = latest.current.holdEdits(projectReviewSnapshotKey(source));
    if (!lease) return false;
    const task = projectTask(lease, () => {
      const now = latest.current.current();
      return now?.id === source.id && (kind === "text" ? now.clips.find(c => c.id === id) === clip : now.title === source.title);
    })!;
    active.current?.task.release();
    const frame: Draft = kind === "text" ? { task, projectId: source.id, kind, clip: clip as TextClip } : { task, projectId: source.id, kind, title: source.title };
    active.current = frame; setDraft(frame); return true;
  };
  const done = (frame: Draft | null, value: string, untitled = "Untitled") => {
    if (!frame || active.current !== frame) return false;
    if (!frame.task.isCurrent()) { cancel(frame); return false; }
    const now = latest.current.current();
    if (!now) { cancel(frame); return false; }
    try {
      if (frame.kind === "title") {
        const title = value.trim() || untitled;
        if (title !== now.title) latest.current.commit({ ...now, title });
      } else if (value.trim() && value !== frame.clip.text) {
        latest.current.commit(updateClip(now, frame.clip.id, { text: value }));
      }
      return true;
    } finally { cancel(frame); }
  };
  useEffect(() => { if (active.current && !active.current.task.isCurrent()) cancel(active.current); }, [options.rendered, draft]);
  useEffect(() => () => { active.current?.task.release(); active.current = null; }, []);
  return { draft, openText: (id: string, source = options.rendered) => open("text", id, source), openTitle: () => open("title"), cancel, done };
}
