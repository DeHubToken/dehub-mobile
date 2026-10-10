import { useEffect, useRef, useState } from "react";
import { cloudProjectPresence, emptyPresence, type PresenceState, type PresenceSocket } from "./cloudProjectPresence";
import { onCloudProjectDraftStored, onCloudProjectSaved } from "./cloudProjectEvents";
type Factory = (wallet: string, check: () => void) => { session: { binding(id: string): Promise<{ owner: string; projectId: string; revision: number } | null> } };
/** Account and local-project changes always leave; joining never uploads edits. */
export function useCloudProjectPresence(address: string | null | undefined, localId: string, factory: Factory, session: (wallet: string) => Promise<{ token: string; expiresAt: number } | null>) {
  const wallet = address?.toLowerCase() || "";
  const scope = useRef({ wallet, localId }); scope.current = { wallet, localId };
  const [state, setState] = useState<PresenceState>(emptyPresence);
  const connection = useRef<ReturnType<typeof cloudProjectPresence> | null>(null), sequence = useRef(0);
  const leave = () => { sequence.current++; connection.current?.stop(); connection.current = null; setState(emptyPresence()); };
  useEffect(() => { leave(); return () => { sequence.current++; connection.current?.stop(); connection.current = null; }; }, [wallet, localId]);
  async function join() {
    leave();
    if (!/^0x[a-f0-9]{40}$/.test(wallet)) { setState({ ...emptyPresence(), status: "error", error: "Sign in to join a live session." }); return; }
    const request = sequence.current;
    const current = () => sequence.current === request && scope.current.wallet === wallet && scope.current.localId === localId;
    const check = () => { if (!current()) throw new Error("Project or account changed"); };
    setState({ ...emptyPresence(), status: "connecting" });
    try {
      const target = await factory(wallet, check).session.binding(localId); check();
      if (!target) throw new Error("Save this project to cloud before joining a live session.");
      const client = cloudProjectPresence(wallet, target, { session: () => session(wallet), socket: url => new WebSocket(url) as unknown as PresenceSocket, update: value => { if (current()) setState(value); } });
      connection.current = client;
      const unsubscribe = onCloudProjectSaved(event => { if (current() && event.wallet === wallet && event.owner === target.owner && event.projectId === target.projectId) client.refresh(event.revision); });
      const offDraft=onCloudProjectDraftStored(event=>{if(current()&&event.wallet===wallet&&event.owner===target.owner&&event.projectId===target.projectId)client.refresh();});
      connection.current = { refresh: client.refresh, stop: () => { unsubscribe(); offDraft(); client.stop(); } };
    } catch (cause) { if (current()) setState({ ...emptyPresence(), status: "error", error: cause instanceof Error ? cause.message : "Live session is unavailable." }); }
  }
  return { ...state, join, leave, refresh: () => connection.current?.refresh() };
}
