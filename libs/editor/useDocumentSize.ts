import { useEffect, useRef, useState } from "react";
import { designPrintDpi, dimensionDisplay, dimensionPixels, type DesignUnit } from "./documentDimensions";

export function useDocumentSize(settings: { width: number; height: number; printDpi?: number }) {
  const sourceWidth = settings.width, sourceHeight = settings.height, sourceDpi = designPrintDpi(settings);
  const [unit, setUnit] = useState<DesignUnit>("px"), [dpi, setDpi] = useState(String(sourceDpi));
  const [width, setWidth] = useState(String(sourceWidth)), [height, setHeight] = useState(String(sourceHeight)), [locked, setLocked] = useState(false);
  const ratio = useRef(sourceWidth / sourceHeight), unitRef = useRef(unit); unitRef.current = unit;
  useEffect(() => { setWidth(dimensionDisplay(sourceWidth, unitRef.current, sourceDpi)); setHeight(dimensionDisplay(sourceHeight, unitRef.current, sourceDpi)); setDpi(String(sourceDpi)); ratio.current = sourceWidth / sourceHeight; }, [sourceWidth, sourceHeight, sourceDpi]);
  const pixels = { width: dimensionPixels(width, unit, Number(dpi)), height: dimensionPixels(height, unit, Number(dpi)) };
  const valid = Number.isInteger(Number(dpi)) && Number(dpi) >= 72 && Number(dpi) <= 600 && [pixels.width, pixels.height].every(value => Number.isInteger(value) && value >= 64 && value <= 8192);
  const change = (axis: "width" | "height", value: string) => {
    if (axis === "width") setWidth(value); else setHeight(value);
    if (locked && Number(value) > 0 && Number.isFinite(Number(value))) { const paired = Number(value) * (axis === "width" ? 1 / ratio.current : ratio.current); if (axis === "width") setHeight(String(Number(paired.toFixed(unit === "px" ? 0 : 3)))); else setWidth(String(Number(paired.toFixed(unit === "px" ? 0 : 3)))); }
  };
  const changeUnit = (next: DesignUnit) => {
    const ppi = Number.isFinite(Number(dpi)) && Number(dpi) > 0 ? Number(dpi) : sourceDpi;
    const w = dimensionPixels(width, unit, ppi), h = dimensionPixels(height, unit, ppi);
    setWidth(dimensionDisplay(Number.isFinite(w) && w > 0 ? w : sourceWidth, next, ppi)); setHeight(dimensionDisplay(Number.isFinite(h) && h > 0 ? h : sourceHeight, next, ppi)); setUnit(next);
  };
  const toggleLock = () => { if (!locked && [width, height].every(value => Number(value) > 0 && Number.isFinite(Number(value)))) ratio.current = Number(width) / Number(height); setLocked(value => !value); };
  const swap = () => { setWidth(height); setHeight(width); const next = Number(height) / Number(width); ratio.current = Number.isFinite(next) && next > 0 ? next : 1; };
  return { unit, dpi, width, height, locked, pixels, valid, setDpi, change, changeUnit, toggleLock, swap };
}
