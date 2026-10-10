import type { ProjectEditLease } from "./projectEditGate";

/** A control owns editing before its first value and releases it exactly once. */
export function projectControlGesture(acquire: () => ProjectEditLease | null, settle: () => void) {
  let active: { lease: ProjectEditLease; cleanup?: () => void } | null = null;
  const finish = () => {
    const owned = active; active = null;
    if (!owned) return;
    try {
      try { owned.cleanup?.(); }
      finally { if (owned.lease.isCurrent()) settle(); }
    } finally { owned.lease.release(); }
  };
  return {
    begin: (cleanup?: () => void) => {
      if (active?.lease.isCurrent()) return true;
      finish();
      const lease = acquire();
      if (!lease) return false;
      active = { lease, cleanup }; return true;
    },
    change: (apply: () => void) => { if (active?.lease.isCurrent()) apply(); },
    isCurrent: () => active?.lease.isCurrent() ?? false,
    finish,
  };
}
