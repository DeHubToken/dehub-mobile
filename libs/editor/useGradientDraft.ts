import { useEffect, useState } from "react";
import { gradientFromColours, type GradientFill } from "./gradientFill";
import type { Clip } from "./types";

export function useGradientDraft(selected?: Clip) {
  const [fill, setFill] = useState<GradientFill>(() => gradientFromColours(["#2563eb", "#22d3ee"]));
  const gradient = selected && (selected.kind === "text" || selected.kind === "shape") ? selected.gradient : null;
  const colour = selected?.kind === "text" ? selected.color : selected?.kind === "shape" ? selected.fill : null;
  useEffect(() => {
    if (gradient) setFill({ ...gradient, ...(gradient.focus ? { focus: { ...gradient.focus } } : {}), stops: gradient.stops.map(stop => ({ ...stop })) });
    else if (colour) setFill(previous => ({ ...previous, stops: previous.stops.map((stop, index) => index ? stop : { ...stop, colour }) }));
  }, [selected?.id, gradient, colour]);
  return { fill, setFill, first: fill.stops[0].colour };
}
