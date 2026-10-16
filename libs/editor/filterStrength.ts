import type { ClipEffects } from "./types";
import { FILTER_PRESETS } from "./filterPresets";
import { matchesFilterPreset } from "./filterMatching";
export function scaledFilterEffects(id: string, strength: number): ClipEffects {
  const preset = FILTER_PRESETS.find(preset => preset.id === id);
  if (!preset) throw new Error("Choose an existing photo filter");
  const amount = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 1;
  const effects: ClipEffects = {};
  for (const key of Object.keys(preset.effects) as (keyof ClipEffects)[]) {
    const value = preset.effects[key];
    if (key === "duotone") { const duo = preset.effects.duotone; if (duo) effects.duotone = { ...duo, amount: duo.amount * amount }; }
    else if (typeof value === "number") { const neutral = ["brightness", "contrast", "saturation"].includes(key) ? 1 : 0; effects[key] = neutral + (value - neutral) * amount; }
  }
  return effects;
}
export function inferFilterStrength(current?: ClipEffects): { id: string; strength: number } | null {
  if (matchesFilterPreset(current, {})) return { id: "none", strength: 0 };
  for (const preset of FILTER_PRESETS) {
    if (preset.id === "none") continue;
    let delta = 0, ratio = 0;
    for (const key of Object.keys(preset.effects) as (keyof ClipEffects)[]) {
      const value = preset.effects[key], now = current?.[key], neutral = ["brightness", "contrast", "saturation"].includes(key) ? 1 : 0;
      if (typeof value !== "number" || Math.abs(value - neutral) <= Math.abs(delta)) continue;
      delta = value - neutral; ratio = ((typeof now === "number" ? now : neutral) - neutral) / delta;
    }
    if (delta && ratio >= 0.009 && ratio <= 1.001 && matchesFilterPreset(current, scaledFilterEffects(preset.id, ratio))) return { id: preset.id, strength: Math.max(0.01, Math.min(1, ratio)) };
  }
  return null;
}
