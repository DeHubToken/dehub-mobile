import { useEffect, useMemo, useRef, useState } from "react";
import type { cloudProjectApi } from "./cloudProjectApi";
import type { cloudProjectSession } from "./cloudProjectSession";
import type { CloudProjectSummary } from "./cloudProjectFormat";
import type { ProjectSnapshot } from "./types";

interface Context { current(): ProjectSnapshot | null; open(snapshot: ProjectSnapshot): Promise<void> | void; preserve(): Promise<void> }
type Device = { api: ReturnType<typeof cloudProjectApi>; session: ReturnType<typeof cloudProjectSession> };

/** Transfers run only after an explicit action, pinned to the active account. */
export function useCloudProjects(address: string | null | undefined, factory: (address: string, check: () => void) => Device, context: Context) {
  const wallet = address?.toLowerCase() || "", scope = useRef({ wallet, context }); scope.current = { wallet, context };
  const mounted = useRef(true), busyRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const device = useMemo(() => /^0x[a-f0-9]{40}$/.test(wallet) ? factory(wallet, () => {
    if (!mounted.current || scope.current.wallet !== wallet) throw new Error("Cloud project account changed");
  }) : null, [wallet, factory]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const [projects, setProjects] = useState<CloudProjectSummary[]>([]), [history, setHistory] = useState<CloudProjectSummary[]>([]);
  const [selected, setSelected] = useState<CloudProjectSummary | null>(null);
  useEffect(() => { setProjects([]); setHistory([]); setSelected(null); setError(""); setSaved(false); }, [wallet]);
  async function run(action: (device: Device, check: () => void) => Promise<void>) {
    if (busyRef.current || !device) return;
    const selectedWallet = wallet;
    const check = () => { if (!mounted.current || scope.current.wallet !== selectedWallet) throw new Error("Cloud project account changed"); };
    busyRef.current = true; setBusy(true); setError(""); setSaved(false);
    try { await action(device, check); check(); }
    catch (cause) { if (mounted.current && scope.current.wallet === selectedWallet) setError(cause instanceof Error ? cause.message : "Cloud project operation failed"); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  return { available: !!device, busy, error, saved, projects, history, selected,
    clearHistory: () => { setSelected(null); setHistory([]); },
    refresh: () => run(async ({ api }, check) => { const rows = await api.list(); check(); setProjects(rows); }),
    save: (copy = false) => run(async ({ api, session }, check) => {
      const snapshot = scope.current.context.current(); if (!snapshot) return;
      await session.save(snapshot, copy); check(); setSaved(true);
      const rows = await api.list(); check(); setProjects(rows); setSelected(null); setHistory([]);
    }),
    showHistory: (project: CloudProjectSummary) => run(async ({ api }, check) => {
      const rows = await api.history(project.projectId); check();
      setSelected({ ...project, revision: rows[0]?.revision ?? project.revision }); setHistory(rows);
    }),
    open: (id: string, revision?: number) => run(async ({ session }, check) => {
      const previousId = scope.current.context.current()?.id;
      await scope.current.context.preserve(); check();
      const snapshot = await session.open(id, revision); check();
      if (scope.current.context.current()?.id !== previousId) throw new Error("The current project changed during transfer");
      await scope.current.context.open(snapshot); check();
    }),
    restore: (revision: number) => run(async ({ session, api }, check) => {
      if (!selected) return;
      const previousId = scope.current.context.current()?.id;
      await scope.current.context.preserve(); check();
      const snapshot = await session.restore(selected.projectId, revision, selected.revision); check();
      if (scope.current.context.current()?.id !== previousId) throw new Error("The current project changed during transfer");
      await scope.current.context.open(snapshot); check();
      const rows = await api.list(); check(); setProjects(rows); setSelected(null); setHistory([]); setSaved(true);
    }),
  };
}
