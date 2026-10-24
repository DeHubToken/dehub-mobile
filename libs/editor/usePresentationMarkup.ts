import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type PresentationPoint = { x: number; y: number };
export type PresentationInk = { points: PresentationPoint[]; colour: string };
export type PresentationMarkTool = "none" | "laser" | "pen";
const clampPoint = (point: PresentationPoint) => ({ x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)) });

/** Presentation-only marks are bounded and discarded when the page changes. */
export function usePresentationMarkup(pageKey: string) {
  const [tool, setTool] = useState<PresentationMarkTool>("none"), [colour, setColour] = useState("#facc15");
  const [strokes, setStrokes] = useState<PresentationInk[]>([]), [active, setActive] = useState<PresentationInk | null>(null), [pointer, setPointer] = useState<PresentationPoint | null>(null);
  const live = useRef<PresentationInk | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const clear = () => { stopTimer(); live.current = null; setActive(null); setStrokes([]); setPointer(null); };
  useLayoutEffect(clear, [pageKey]);
  useLayoutEffect(() => { stopTimer(); live.current = null; setActive(null); setPointer(null); }, [tool]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const begin = (point: PresentationPoint) => {
    if (![point.x, point.y].every(Number.isFinite)) return;
    stopTimer(); point = clampPoint(point);
    if (tool === "laser") setPointer(point);
    if (tool === "pen") { const stroke = { points: [point], colour }; live.current = stroke; setActive(stroke); }
  };
  const move = (point: PresentationPoint) => {
    if (![point.x, point.y].every(Number.isFinite)) return;
    point = clampPoint(point);
    if (tool === "laser") { stopTimer(); setPointer(point); }
    const stroke = live.current;
    if (tool !== "pen" || !stroke || stroke.points.length >= 1000) return;
    const previous = stroke.points[stroke.points.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.0015) return;
    const next = { ...stroke, points: [...stroke.points, point] }; live.current = next; setActive(next);
  };
  const end = () => {
    if (tool === "laser") { stopTimer(); timer.current = setTimeout(() => { setPointer(null); timer.current = null; }, 700); }
    const stroke = live.current; live.current = null; setActive(null);
    if (stroke) setStrokes(previous => {
      const next = [...previous.slice(-49), stroke];
      let count = next.reduce((total, item) => total + item.points.length, 0);
      while (count > 10000 && next.length > 1) count -= next.shift()!.points.length;
      return next;
    });
  };
  const undo = () => { if (live.current) { live.current = null; setActive(null); } else setStrokes(previous => previous.slice(0, -1)); };
  return { tool, setTool, colour, setColour, strokes, active, pointer, begin, move, end, undo, clear, canUndo: strokes.length > 0 || !!active };
}

export function presentationInkPath(points: readonly PresentationPoint[], width: number, height: number): string {
  if (!points.length) return "";
  return points.map((point, index) => `${index ? "L" : "M"}${(point.x * width).toFixed(2)} ${(point.y * height).toFixed(2)}`).join(" ")
    + (points.length === 1 ? ` l0.01 0` : "");
}
