import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import { editDesignGuide, getDesignGuides, type GuideAxis } from "../../libs/editor/designGuides";
import type { ProjectSnapshot } from "../../libs/editor/types";
import type { ProjectEditLease } from "../../libs/editor/projectEditGate";

type Rect = { x: number; y: number; w: number; h: number };
type Target = { axis: GuideAxis; from: number | null; rect: Rect };
type Draft = { target: Target; position: number; inside: boolean };
type Props = {
  project: ProjectSnapshot; active: boolean; rulers: boolean; disabled: boolean;
  page: Rect; viewport: { w: number; h: number }; onActivate: () => void;
  onBegin?: () => ProjectEditLease | null; onCommit: (next: ProjectSnapshot) => void;
};

function GuideTarget({ target, label, value, max, begin, move, finish, cancel, change, moving }: {
  target: Target; label: string; value: number; max: number; moving: boolean;
  begin: (target: Target, x: number, y: number) => void; move: (dx: number, dy: number) => void;
  finish: () => void; cancel: () => void; change: (target: Target, position: number | null) => void;
}) {
  const live = useRef({ target, begin, move, finish, cancel, change });
  live.current = { target, begin, move, finish, cancel, change };
  const gesture = useMemo(() => {
    const pan = Gesture.Pan().runOnJS(true).maxPointers(1).minDistance(2)
      .onStart(event => { const p = live.current; p.begin(p.target, p.target.rect.x + event.x - event.translationX, p.target.rect.y + event.y - event.translationY); p.move(event.translationX, event.translationY); })
      .onUpdate(event => live.current.move(event.translationX, event.translationY))
      .onEnd(() => live.current.finish()).onFinalize(() => live.current.cancel());
    const tap = Gesture.Tap().runOnJS(true).numberOfTaps(2).onEnd((_event, success) => { if (success && live.current.target.from !== null) live.current.change(live.current.target, null); });
    return Gesture.Race(pan, tap);
  }, []);
  const { rect, axis, from } = target, vertical = axis === "vertical";
  return <GestureDetector gesture={gesture}><View collapsable={false} accessible accessibilityRole={from === null ? "button" : "adjustable"} accessibilityLabel={label}
    accessibilityHint={from === null ? "Drag onto the page or activate to add a centre guide" : "Drag to move. Drag off the page or double tap to remove."}
    accessibilityValue={from === null ? undefined : { min: 0, max, now: value, text: `${value} px` }}
    accessibilityActions={from === null ? [{ name: "activate" }] : [{ name: "increment" }, { name: "decrement" }, { name: "remove", label: "Remove guide" }]}
    onAccessibilityAction={event => { const name = event.nativeEvent.actionName; if (from === null) change(target, 0.5); else if (name === "remove") change(target, null); else if (name === "increment" || name === "decrement") change(target, Math.max(0, Math.min(1, from + (name === "increment" ? 1 : -1) / max))); }}
    style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
    {from !== null && !moving && <View pointerEvents="none" style={vertical ? { position: "absolute", left: 10, top: 0, bottom: 0, width: 1, backgroundColor: "#22d3ee" } : { position: "absolute", top: 10, left: 0, right: 0, height: 1, backgroundColor: "#22d3ee" }} />}
  </View></GestureDetector>;
}

export default function GuideEditorOverlay(props: Props) {
  const { t } = useTranslation(), { project, active, rulers, disabled, page, viewport } = props;
  const guides = getDesignGuides(project.settings.guides);
  const live = useRef(props); live.current = props;
  const [draft, setDraft] = useState<Draft | null>(null);
  const drag = useRef<{ before: ProjectSnapshot; target: Target; page: Rect; x: number; y: number; lease: ProjectEditLease | null; draft: Draft } | null>(null);
  const cancel = () => { const previous = drag.current; drag.current = null; previous?.lease?.release(); setDraft(null); };
  useEffect(() => () => { const previous = drag.current; drag.current = null; previous?.lease?.release(); }, []);
  useEffect(() => { cancel(); }, [project.id, page.x, page.y, page.w, page.h]);
  useEffect(() => { if (!active || disabled) cancel(); }, [active, disabled]);
  const begin = (target: Target, x: number, y: number) => {
    cancel(); const p = live.current; if (p.disabled || p.page.w <= 0 || p.page.h <= 0) return;
    const lease = p.onBegin?.() ?? null; if (p.onBegin && !lease) return;
    const position = target.from ?? (target.axis === "vertical" ? (x - p.page.x) / p.page.w : (y - p.page.y) / p.page.h);
    const pending = { target, position, inside: false };
    drag.current = { before: p.project, target, page: { ...p.page }, x, y, lease, draft: pending };
    setDraft(pending); p.onActivate();
  };
  const move = (dx: number, dy: number) => {
    const d = drag.current; if (!d || (d.lease && !d.lease.isCurrent())) return;
    const { target, page, x, y } = d, vertical = target.axis === "vertical";
    const position = target.from === null ? vertical ? (x + dx - page.x) / page.w : (y + dy - page.y) / page.h : target.from + (vertical ? dx / page.w : dy / page.h);
    d.draft = { target, position, inside: position >= 0 && position <= 1 && x + dx >= page.x && x + dx <= page.x + page.w && y + dy >= page.y && y + dy <= page.y + page.h };
    setDraft(d.draft);
  };
  const finish = () => {
    const d = drag.current; if (!d) return;
    try {
      if (live.current.project.id === d.before.id && (!d.lease || d.lease.isCurrent())) {
        const next = editDesignGuide(d.before, d.target.axis, d.target.from, d.draft.inside ? d.draft.position : null);
        if (next !== d.before) live.current.onCommit(next);
      }
    } finally { cancel(); }
  };
  const change = (target: Target, position: number | null) => {
    cancel(); const p = live.current; if (p.disabled) return;
    const lease = p.onBegin?.() ?? null; if (p.onBegin && !lease) return;
    try { p.onActivate(); const next = editDesignGuide(p.project, target.axis, target.from, position); if (next !== p.project && (!lease || lease.isCurrent())) p.onCommit(next); } finally { lease?.release(); }
  };
  if (disabled) return null;
  const targets: Target[] = [];
  if (rulers) targets.push({ axis: "horizontal", from: null, rect: { x: page.x, y: page.y - 18, w: page.w, h: 18 } }, { axis: "vertical", from: null, rect: { x: page.x - 18, y: page.y, w: 18, h: page.h } });
  if (active) for (const axis of ["vertical", "horizontal"] as const) for (const from of guides[axis]) targets.push({ axis, from, rect: axis === "vertical" ? { x: page.x + from * page.w - 10, y: page.y, w: 20, h: page.h } : { x: page.x, y: page.y + from * page.h - 10, w: page.w, h: 20 } });
  return <View pointerEvents="box-none" style={{ position: "absolute", left: 0, top: 0, width: viewport.w, height: viewport.h, overflow: "hidden" }}>
    {targets.map(target => <GuideTarget key={`${target.axis}:${target.from}`} target={target} max={target.axis === "vertical" ? project.settings.width : project.settings.height} value={Math.round((target.from ?? 0.5) * (target.axis === "vertical" ? project.settings.width : project.settings.height))} label={t(`editor.guides.${target.axis}`, { defaultValue: target.axis === "vertical" ? "Vertical guide" : "Horizontal guide" })} moving={draft?.target.axis === target.axis && draft?.target.from === target.from} begin={begin} move={move} finish={finish} cancel={cancel} change={change} />)}
    {draft?.inside && <View pointerEvents="none" style={draft.target.axis === "vertical" ? { position: "absolute", left: page.x + draft.position * page.w, top: page.y, height: page.h, width: 1, backgroundColor: "white" } : { position: "absolute", top: page.y + draft.position * page.h, left: page.x, width: page.w, height: 1, backgroundColor: "white" }} />}
    {draft && <View pointerEvents="none" style={{ position: "absolute", left: 8, top: 8, backgroundColor: "#000d", padding: 8, borderRadius: 8 }}><Text style={{ fontSize: 12, color: "#cffafe" }}>{draft.inside ? `${Math.round(draft.position * (draft.target.axis === "vertical" ? project.settings.width : project.settings.height))} px` : (draft.target.from === null ? t("editor.guides.dragOntoPage", { defaultValue: "Drag onto the page to add a guide" }) : t("editor.guides.releaseOutside", { defaultValue: "Release to remove this guide" }))}</Text></View>}
  </View>;
}
