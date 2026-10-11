import { useEffect, useMemo, useRef, useState } from "react";
import { captionReplacement, captionTextContains, captionTextKey, editableCaptionText, type CaptionTextPlan, type CaptionTextProject } from "./captionText";
import type { TextClip } from "./types";

export function useCaptionTextEditor(project: CaptionTextProject, disabled: boolean, onApply: (plan: CaptionTextPlan) => boolean | Promise<boolean>, onSeek: (clip: TextClip) => void) {
  const [query, setQuery] = useState(""), [replacement, setReplacement] = useState(""), [matchCase, setMatchCase] = useState(false);
  const [page, setPage] = useState(0), [working, setWorking] = useState(false);
  const [status, setStatus] = useState<"textSaved" | "textChanged" | null>(null);
  const [draft, setDraft] = useState<{ id: string; text: string; original: string; sourceKey: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setPage(0); }, [query, matchCase]);
  const captions = useMemo(() => editableCaptionText(project), [project.clips, project.tracks]);
  const sourceKey = useMemo(() => captionTextKey(project), [project.clips, project.tracks]);
  const filtered = useMemo(() => captions.filter(clip => captionTextContains(clip.text, query, matchCase)), [captions, query, matchCase]);
  const pages = Math.max(1, Math.ceil(filtered.length / 10)), currentPage = Math.min(page, pages - 1);
  const replacementPlan = useMemo(() => { try { return captionReplacement(project, query, replacement, matchCase); } catch { return null; } }, [project.clips, project.tracks, query, replacement, matchCase]);
  const blocked = disabled || working, stale = !!draft && draft.sourceKey !== sourceKey;
  const choose = (clip: TextClip) => {
    if (blocked) return;
    setDraft({ id: clip.id, text: clip.text, original: clip.text, sourceKey }); setStatus(null); onSeek(clip);
  };
  const commit = async (plan: CaptionTextPlan) => {
    if (blocked) return;
    setWorking(true); setStatus(null);
    try {
      if (!await onApply(plan)) throw new Error("Caption correction unavailable");
      if (mounted.current) { setDraft(null); setStatus("textSaved"); }
    } catch { if (mounted.current) setStatus("textChanged"); }
    finally { if (mounted.current) setWorking(false); }
  };
  return {
    query, setQuery, replacement, setReplacement, matchCase, setMatchCase, captions, filtered,
    page: currentPage, pages, setPage, rows: filtered.slice(currentPage * 10, (currentPage + 1) * 10),
    draft, stale, status, blocked, choose,
    edit: (text: string) => setDraft(current => current ? { ...current, text } : null),
    close: () => setDraft(null),
    reload: () => { const clip = captions.find(item => item.id === draft?.id); if (clip) choose(clip); else setDraft(null); },
    canSave: !blocked && !!draft && !stale && draft.text !== draft.original && draft.text.length <= 20_000,
    save: () => { if (draft && !stale) void commit({ sourceKey: draft.sourceKey, updates: [{ id: draft.id, text: draft.text }] }); },
    replaceCount: replacementPlan?.updates.length ?? 0,
    replace: () => { if (replacementPlan?.updates.length) void commit(replacementPlan); },
  };
}
