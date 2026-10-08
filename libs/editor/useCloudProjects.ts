import { useEffect, useMemo, useRef, useState } from "react";
import type { cloudProjectApi } from "./cloudProjectApi";
import type { cloudProjectSession } from "./cloudProjectSession";
import type { CloudProjectSummary } from "./cloudProjectFormat";
import type { ProjectSnapshot } from "./types";
import { projectReviewDraft, projectReviewSnapshotKey, projectReviewWallet, type ProjectReviewComment, type ProjectReviewDraft, type ProjectReviewInvitation, type ProjectReviewMember, type ProjectReviewRole, type ProjectReviewTarget } from "./cloudProjectReview";

interface Context { current(): ProjectSnapshot | null; open(snapshot: ProjectSnapshot): Promise<void> | void; preserve(): Promise<void>; seek?(seconds: number): void }
type Device = { api: ReturnType<typeof cloudProjectApi>; session: ReturnType<typeof cloudProjectSession>; uuid(): string };

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
  const [viewTrash, setViewTrash] = useState(false);
  const [selected, setSelected] = useState<CloudProjectSummary | null>(null);
  const [viewShared, setViewShared] = useState(false), [sharedProjects, setSharedProjects] = useState<ProjectReviewInvitation[]>([]);
  const [review, setReview] = useState<ProjectReviewTarget | null>(null), [members, setMembers] = useState<ProjectReviewMember[]>([]), [comments, setComments] = useState<ProjectReviewComment[]>([]);
  const pendingComment = useRef<{fingerprint: string; id: string} | null>(null);
  const openedReview = useRef<{localId: string; owner: string; projectId: string; revision: number; snapshotKey: string} | null>(null);
  const clearReview = () => { setReview(null); setMembers([]); setComments([]); };
  useEffect(() => { setProjects([]); setHistory([]); setSelected(null); setViewTrash(false); setViewShared(false); setSharedProjects([]); clearReview(); setError(""); setSaved(false); pendingComment.current=null; openedReview.current=null; }, [wallet]);
  async function run(action: (device: Device, check: () => void) => Promise<void>) {
    if (busyRef.current || !device) return;
    const selectedWallet = wallet;
    const check = () => { if (!mounted.current || scope.current.wallet !== selectedWallet) throw new Error("Cloud project account changed"); };
    busyRef.current = true; setBusy(true); setError(""); setSaved(false);
    try { await action(device, check); check(); }
    catch (cause) { if (mounted.current && scope.current.wallet === selectedWallet) setError(cause instanceof Error ? cause.message : "Cloud project operation failed"); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  return { available: !!device, busy, error, saved, projects, history, selected, viewTrash, viewShared, sharedProjects, review, members, comments, clearReview,
    clearHistory: () => { setSelected(null); setHistory([]); },
    refresh: () => run(async ({ api }, check) => {
      if (viewShared) { const rows=await api.review.inbox(); check(); setSharedProjects(rows); }
      else { const rows = await api.list(viewTrash); check(); setProjects(rows); }
    }),
    switchView: (trashed: boolean) => run(async ({ api }, check) => {
      const rows = await api.list(trashed); check(); setProjects(rows); setViewTrash(trashed); setViewShared(false); setSelected(null); setHistory([]); clearReview();
    }),
    switchShared: () => run(async ({ api }, check) => { const rows=await api.review.inbox(); check(); setSharedProjects(rows); setViewShared(true); setViewTrash(false); setSelected(null); setHistory([]); clearReview(); }),
    acceptReview: (project: ProjectReviewInvitation) => run(async ({api},check) => { await api.review.accept(project); check(); const rows=await api.review.inbox(); check(); setSharedProjects(rows); }),
    showReview: (target: ProjectReviewTarget) => run(async ({api},check) => {
      if (target.ownerWallet!==wallet) {
        const invitations=await api.review.inbox(); check();
        const live=invitations.find(row=>row.ownerWallet===target.ownerWallet && row.projectId===target.projectId && row.accepted);
        if (!live) { clearReview(); throw new Error("Project review is unavailable"); }
        target={...target,role:live.role};
      }
      const rows=await api.review.comments(target.ownerWallet,target.projectId); check();
      const people=target.ownerWallet===wallet ? await api.review.members(target.projectId) : []; check();
      setReview(target); setComments(rows); setMembers(people); setSelected(null); setHistory([]);
    }),
    refreshReview: () => run(async ({api},check) => {
      if (!review) return;
      if (review.ownerWallet!==wallet) {
        const invitations=await api.review.inbox(); check();
        const live=invitations.find(row=>row.ownerWallet===review.ownerWallet && row.projectId===review.projectId && row.accepted);
        if (!live) { clearReview(); throw new Error("Project review is unavailable"); }
        setReview({...review,role:live.role});
      }
      const rows=await api.review.comments(review.ownerWallet,review.projectId); check();
      const people=review.ownerWallet===wallet ? await api.review.members(review.projectId) : []; check();
      setComments(rows); setMembers(people);
    }),
    shareReview: (member: string, role: ProjectReviewRole | "none", success?: () => void) => run(async ({api},check) => {
      if (!review || review.ownerWallet!==wallet) throw new Error("Only the project owner can manage review access");
      const recipient=projectReviewWallet(member), existing=members.find(person=>person.memberWallet===recipient);
      await api.review.share(review.projectId,recipient,role,existing?.stateVersion ?? 0); check();
      const people=await api.review.members(review.projectId); check(); setMembers(people); success?.();
    }),
    addReviewComment: (draft: ProjectReviewDraft, success?: () => void) => run(async ({api,uuid},check) => {
      if (!review || review.role==='viewer') throw new Error("Comment access is unavailable");
      const value=projectReviewDraft(draft), fingerprint=JSON.stringify({wallet,owner:review.ownerWallet,id:review.projectId,value});
      if (pendingComment.current?.fingerprint!==fingerprint) pendingComment.current={fingerprint,id:uuid()};
      await api.review.comment(review.ownerWallet,review.projectId,pendingComment.current.id,value); check();
      pendingComment.current=null; success?.();
      const rows=await api.review.comments(review.ownerWallet,review.projectId); check(); setComments(rows);
    }),
    resolveReviewComment: (comment: ProjectReviewComment) => run(async ({api},check) => {
      if (!review || comment.ownerWallet!==review.ownerWallet || comment.projectId!==review.projectId) throw new Error("Project review changed");
      await api.review.resolve(comment,!comment.resolved); check(); const rows=await api.review.comments(review.ownerWallet,review.projectId); check(); setComments(rows);
    }),
    openReview: (revision?: number, seconds=0, success?: () => void) => run(async ({session},check) => {
      if (!review) return;
      const targetRevision=revision ?? review.revision, opened=openedReview.current, current=scope.current.context.current();
      if (opened && opened.owner===review.ownerWallet && opened.projectId===review.projectId && opened.revision===targetRevision && current?.id===opened.localId && projectReviewSnapshotKey(current)===opened.snapshotKey) {
        scope.current.context.seek?.(seconds); success?.(); return;
      }
      const previousId=scope.current.context.current()?.id;
      await scope.current.context.preserve(); check();
      const result=await session.openReview(review.ownerWallet,review.projectId,targetRevision); check();
      if (scope.current.context.current()?.id!==previousId) throw new Error("The current project changed during transfer");
      await scope.current.context.open(result.snapshot); check();
      openedReview.current={localId:result.snapshot.id,owner:review.ownerWallet,projectId:review.projectId,revision:result.revision,snapshotKey:projectReviewSnapshotKey(scope.current.context.current() || result.snapshot)};
      scope.current.context.seek?.(seconds);
      success?.();
    }),
    setTrash: (project: CloudProjectSummary, trashed: boolean) => run(async ({ api }, check) => {
      await api.setTrash(project, trashed); check();
      const rows = await api.list(viewTrash); check(); setProjects(rows); setSelected(null); setHistory([]);
    }),
    save: (copy = false) => run(async ({ api, session }, check) => {
      const snapshot = scope.current.context.current(); if (!snapshot) return;
      await session.save(snapshot, copy); check(); setSaved(true);
      const rows = await api.list(); check(); setViewTrash(false); setViewShared(false); clearReview(); setProjects(rows); setSelected(null); setHistory([]);
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
      const rows = await api.list(); check(); setViewTrash(false); setProjects(rows); setSelected(null); setHistory([]); setSaved(true);
    }),
  };
}
