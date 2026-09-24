/**
 * Tool panels for video editing: speed, sound, transitions and animations.
 * Same fields as the web inspector (dehubweb src/components/editor/Inspector.tsx).
 */
import React from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Chip, ChipRow, Labeled, Range, type LayerClip, type Patch } from "./EditorPanels";
import type { ClipAnimationKind, MediaClip, Transition, TransitionKind } from "../../libs/editor/types";
import { MAX_TRANSITION_DURATION, MIN_TRANSITION_DURATION, SPEEDS, TRANSITION_KINDS } from "../../libs/editor/timeline";

interface PanelProps<C> {
  clip: C;
  live: (p: Patch) => void;
  commit: (p: Patch) => void;
  settle: () => void;
}

export function SpeedPanel({ clip, onPick }: { clip: MediaClip; onPick: (speed: number) => void }) {
  const { t } = useTranslation();
  const current = clip.speed && clip.speed > 0 ? clip.speed : 1;
  return (
    <Labeled label={t("editor.video.speed")}>
      <ChipRow>
        {SPEEDS.map((s) => (
          <Chip key={s} label={t("editor.video.speedValue", { value: s })} active={Math.abs(current - s) < 0.001} onPress={() => onPick(s)} />
        ))}
      </ChipRow>
    </Labeled>
  );
}

export function SoundPanel({ clip, live, settle }: PanelProps<MediaClip>) {
  const { t } = useTranslation();
  const a = clip.audio ?? {};
  const vol = a.volume ?? 1;
  const maxFade = Math.max(0.1, Math.min(5, clip.duration / 2));
  return (
    <View style={{ gap: 4 }}>
      <Range
        label={t("editor.video.volume", { value: Math.round(vol * 100) })}
        value={vol}
        min={0}
        max={1}
        step={0.05}
        onLive={(v) => live({ audio: { ...a, volume: v } })}
        onDone={settle}
      />
      <Range
        label={t("editor.video.fadeIn", { value: (a.fadeIn ?? 0).toFixed(1) })}
        value={Math.min(a.fadeIn ?? 0, maxFade)}
        min={0}
        max={maxFade}
        step={0.1}
        onLive={(v) => live({ audio: { ...a, fadeIn: v } })}
        onDone={settle}
      />
      <Range
        label={t("editor.video.fadeOut", { value: (a.fadeOut ?? 0).toFixed(1) })}
        value={Math.min(a.fadeOut ?? 0, maxFade)}
        min={0}
        max={maxFade}
        step={0.1}
        onLive={(v) => live({ audio: { ...a, fadeOut: v } })}
        onDone={settle}
      />
      <Text className="text-theme-neutrals-400 text-xs">{t("editor.video.fadeHint")}</Text>
    </View>
  );
}

const TRANSITION_KEYS: Record<TransitionKind, string> = {
  fade: "editor.video.tFade",
  "slide-left": "editor.video.tSlideLeft",
  "slide-right": "editor.video.tSlideRight",
  "wipe-left": "editor.video.tWipeLeft",
  "wipe-right": "editor.video.tWipeRight",
};

export function TransitionPanel(props: {
  value: Transition | null;
  max: number;
  onPick: (t: Transition | null) => void;
  onLiveDuration: (d: number) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const max = Math.max(MIN_TRANSITION_DURATION, Math.min(MAX_TRANSITION_DURATION, props.max));
  return (
    <View style={{ gap: 6 }}>
      <Labeled label={t("editor.video.transition")}>
        <ChipRow>
          <Chip label={t("editor.video.none")} active={!props.value} onPress={() => props.onPick(null)} />
          {TRANSITION_KINDS.map((k) => (
            <Chip
              key={k}
              label={t(TRANSITION_KEYS[k])}
              active={props.value?.kind === k}
              onPress={() => props.onPick({ kind: k, duration: Math.min(props.value?.duration ?? 0.5, max) })}
            />
          ))}
        </ChipRow>
      </Labeled>
      {props.value && (
        <Range
          label={t("editor.video.transitionLength", { value: props.value.duration.toFixed(1) })}
          value={Math.min(props.value.duration, max)}
          min={MIN_TRANSITION_DURATION}
          max={max}
          step={0.1}
          onLive={props.onLiveDuration}
          onDone={props.onDone}
        />
      )}
    </View>
  );
}

const ANIMATIONS: ClipAnimationKind[] = ["fade", "slide-up", "slide-down", "slide-left", "slide-right", "zoom-in", "zoom-out", "pop", "rise", "blur"];
const ANIMATION_KEYS: Record<ClipAnimationKind, string> = {
  fade: "editor.video.aFade",
  "slide-up": "editor.video.aSlideUp",
  "slide-down": "editor.video.aSlideDown",
  "slide-left": "editor.video.aSlideLeft",
  "slide-right": "editor.video.aSlideRight",
  "zoom-in": "editor.video.aZoomIn",
  "zoom-out": "editor.video.aZoomOut",
  pop: "editor.video.aPop",
  rise: "editor.video.aRise",
  blur: "editor.video.aBlur",
};

export function AnimatePanel({ clip, commit }: PanelProps<LayerClip>) {
  const { t } = useTranslation();
  const len = (d: number) => Math.min(0.6, Math.max(0.1, d / 3));
  const row = (which: "animateIn" | "animateOut", label: string) => {
    const cur = clip[which];
    return (
      <Labeled label={label}>
        <ChipRow>
          <Chip label={t("editor.video.none")} active={!cur} onPress={() => commit({ [which]: undefined })} />
          {ANIMATIONS.map((k) => (
            <Chip key={k} label={t(ANIMATION_KEYS[k])} active={cur?.kind === k} onPress={() => commit({ [which]: { kind: k, duration: cur?.duration ?? len(clip.duration) } })} />
          ))}
        </ChipRow>
      </Labeled>
    );
  };
  return (
    <View style={{ gap: 6 }}>
      {row("animateIn", t("editor.video.animateIn"))}
      {row("animateOut", t("editor.video.animateOut"))}
    </View>
  );
}
