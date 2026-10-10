import type { ProjectEditLease } from "./projectEditGate";

/** Processing owns editing until its result is accepted or discarded. */
export function projectTask(lease: ProjectEditLease | null, valid: () => boolean = () => true) {
  if (!lease) return null;
  let finished = false;
  return {
    isCurrent: () => !finished && lease.isCurrent() && valid(),
    release: () => { if (!finished) { finished = true; lease.release(); } },
  };
}
