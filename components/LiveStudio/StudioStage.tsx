/**
 * Live Studio's preview on a phone: the creator's widgets over a stand-in
 * picture, moved by dragging. The twin of dehubweb's StudioStage — the same
 * widgets from OverlayWidgets, so what is placed is what viewers get — with the
 * resize handle swapped for a size control in the settings, because a corner
 * handle on a widget a few dozen points tall is not something a thumb can hit.
 */
import React, { useRef, useState } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import { drawOrder } from "../../libs/live-overlay/layout";
import { isKnownKind, type OverlayKind } from "../../libs/live-overlay/registry";
import type { OverlayRect, OverlayStats, OverlayWidget } from "../../libs/live-overlay/types";
import { OverlayWidgetView } from "../LiveOverlay/OverlayWidgets";

interface Props {
  widgets: OverlayWidget[];
  portrait: boolean;
  selectedId: string | null;
  stats: OverlayStats;
  onSelect: (id: string | null) => void;
  onMove: (id: string, rect: OverlayRect) => void;
}

export function clampRect(rect: OverlayRect): OverlayRect {
  const w = Math.min(1, Math.max(0.03, rect.w));
  const h = Math.min(1, Math.max(0.03, rect.h));
  return { w, h, x: Math.min(1 - w, Math.max(0, rect.x)), y: Math.min(1 - h, Math.max(0, rect.y)) };
}

function DraggableWidget({
  widget,
  rect,
  stage,
  selected,
  stats,
  onSelect,
  onMove,
}: {
  widget: OverlayWidget;
  rect: OverlayRect;
  stage: { width: number; height: number };
  selected: boolean;
  stats: OverlayStats;
  onSelect: (id: string) => void;
  onMove: (id: string, rect: OverlayRect) => void;
}) {
  const start = useRef(rect);
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(2)
    .onBegin(() => {
      start.current = rect;
      onSelect(widget.id);
    })
    .onUpdate((e) => {
      onMove(
        widget.id,
        clampRect({
          ...start.current,
          x: start.current.x + e.translationX / stage.width,
          y: start.current.y + e.translationY / stage.height,
        }),
      );
    });
  const tap = Gesture.Tap().runOnJS(true).onEnd(() => onSelect(widget.id));

  const box = { width: rect.w * stage.width, height: rect.h * stage.height };
  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <View
        style={{
          position: "absolute",
          left: rect.x * stage.width,
          top: rect.y * stage.height,
          width: box.width,
          height: box.height,
          overflow: "hidden",
          opacity: widget.enabled ? 1 : 0.35,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? "#fff" : "rgba(255,255,255,0.25)",
        }}
      >
        <View pointerEvents="none" style={{ flex: 1 }}>
          <OverlayWidgetView
            kind={widget.kind as OverlayKind}
            settings={widget.settings || {}}
            streamId=""
            stats={stats}
            initialViewers={0}
            box={box}
          />
        </View>
      </View>
    </GestureDetector>
  );
}

export function StudioStage({ widgets, portrait, selectedId, stats, onSelect, onMove }: Props) {
  const { t } = useTranslation();
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setStage((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };
  const drawable = drawOrder(widgets.filter((w) => isKnownKind(w.kind)));

  return (
    <Pressable
      onPress={() => onSelect(null)}
      onLayout={onLayout}
      accessibilityLabel={t("liveStudio.stageLabel")}
      style={{
        width: portrait ? "56%" : "100%",
        alignSelf: "center",
        aspectRatio: portrait ? 9 / 16 : 16 / 9,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#18181b",
      }}
    >
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, fontWeight: "500" }}>{t("liveStudio.stageLabel")}</Text>
      </View>
      {stage.height > 0 &&
        drawable.map((widget) => (
          <DraggableWidget
            key={widget.id}
            widget={widget}
            rect={portrait ? widget.portrait : widget.landscape}
            stage={stage}
            selected={widget.id === selectedId}
            stats={stats}
            onSelect={onSelect}
            onMove={onMove}
          />
        ))}
    </Pressable>
  );
}
