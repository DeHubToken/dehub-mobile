export interface ProjectEditLease {
  isCurrent(): boolean;
  release(): void;
}

/** A stale completion cannot release a newer project's editing ownership. */
export function projectEditGate(changed: () => void) {
  const holds = new Set<symbol>();
  return {
    isEditing: () => holds.size > 0,
    hold: (): ProjectEditLease => {
      const token = Symbol();
      holds.add(token); changed();
      return {
        isCurrent: () => holds.has(token),
        release: () => { if (holds.delete(token)) changed(); },
      };
    },
    reset: (notify = true) => { holds.clear(); if (notify) changed(); },
  };
}
