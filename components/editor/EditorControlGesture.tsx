import { createContext, useContext, useEffect, useRef } from "react";
import type { ProjectEditLease } from "../../libs/editor/projectEditGate";
import { projectControlGesture } from "../../libs/editor/projectControlGesture";

export const EditorControlGestureContext = createContext<{ scope: string; begin: () => ProjectEditLease | null } | null>(null);

export function useEditorControlGesture(settle: () => void) {
  const context = useContext(EditorControlGestureContext);
  const latest = useRef({ context, settle }); latest.current = { context, settle };
  const control = useRef<ReturnType<typeof projectControlGesture> | null>(null);
  if (!control.current) control.current = projectControlGesture(
    () => latest.current.context ? latest.current.context.begin() : { isCurrent: () => true, release: () => {} },
    () => latest.current.settle(),
  );
  const gesture = control.current;
  useEffect(() => () => gesture.finish(), [gesture, context?.scope]);
  return gesture;
}
