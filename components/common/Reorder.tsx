/**
 * Hold-and-drag reordering for a row or grid of equal slots (the menu drawer's
 * tiles, the bottom bar's icons). Same behaviour as dehubweb
 * hooks/use-drag-reorder:
 *
 *   - hold an item still for a moment and it lifts (a light haptic), drag it
 *     to its new spot, let go;
 *   - moving before the hold completes is a scroll, and a short tap is a tap;
 *   - the scroller scrolls when the finger nears its edge.
 *
 * Motion follows dehubweb .agents/skills/dehub-ui-craft (Motion): the press
 * shows while it holds and the lift grows out of it, the item follows the
 * finger 1:1 (only scale and shadow ease), neighbours glide one slot, the
 * drop decelerates into its slot, and a reset glides everything back in a
 * short stagger. Reanimated's timings and layout transitions follow the
 * system's reduce-motion setting, so the reorder still happens, unanimated.
 *
 * Slots are taken by index when the drag starts: every item is the same size
 * and laid out by position, so "which slot is under the finger" never depends
 * on a layout that is still catching up with the last move. The other items
 * glide to their new places with a layout transition.
 *
 * Usage: `const reorder = useReorder({ ids, onCommit, scrollRef })`, render
 * `reorder.order`, wrap each item in `<ReorderItem id reorder>`, and give the
 * scroller `ref={reorder.scrollRef}` as a Reanimated ScrollView.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  LinearTransition,
  runOnJS,
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

type Rect = { x: number; y: number; w: number; h: number };

const HOLD_MS = 380;
const EDGE = 44;
/** Arrival curve: fast out, soft landing, no bounce. */
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const PRESS_DELAY = 90;
const PRESS_SCALE = 0.96;
const LIFT_MS = 250;
const SLIDE_MS = 320;
const DROP_MS = 280;
const STAGGER_MS = 40;
const SLIDE = LinearTransition.duration(SLIDE_MS).easing(EASE);
const RESET_SLIDES = Array.from({ length: 11 }, (_, i) =>
  LinearTransition.duration(SLIDE_MS).easing(EASE).delay(i * STAGGER_MS));

/** When the last drag ended, so a press that rides in on its release is ignored. */
let lastDropAt = 0;
export const justDropped = () => Date.now() - lastDropAt < 350;

interface Options {
  ids: string[];
  onCommit: (ids: string[]) => void;
  disabled?: boolean;
  horizontal?: boolean;
  /** Scale while lifted: 1.06 for tiles, 1.08 for small icons. */
  liftScale?: number;
}

export interface ReorderCtx {
  disabled: boolean;
  horizontal: boolean;
  liftScale: number;
  draggingId: string | null;
  /** Set while a reset glides everything back: each item's stagger slot. */
  resetIndex: Map<string, number> | null;
  layouts: SharedValue<Record<string, Rect>>;
  order: SharedValue<string[]>;
  slots: SharedValue<Rect[]>;
  active: SharedValue<string>;
  startIndex: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  absX: SharedValue<number>;
  absY: SharedValue<number>;
  scroll: SharedValue<number>;
  scrollStart: SharedValue<number>;
  viewport: SharedValue<{ x: number; y: number; w: number; h: number }>;
  dropX: SharedValue<number>;
  dropY: SharedValue<number>;
  dropping: SharedValue<string>;
  scrollRef: ReturnType<typeof useAnimatedRef<Animated.ScrollView>>;
  begin: (id: string) => void;
  hitTest: () => void;
  end: (next: string[], committed: boolean) => void;
}

export function useReorder({ ids, onCommit, disabled = false, horizontal = false, liftScale = 1.06 }: Options) {
  const [liveOrder, setLiveOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resetIndex, setResetIndex] = useState<Map<string, number> | null>(null);
  const order = liveOrder ?? ids;

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scroll = useScrollOffset(scrollRef);
  const layouts = useSharedValue<Record<string, Rect>>({});
  const orderSV = useSharedValue<string[]>(ids);
  const slots = useSharedValue<Rect[]>([]);
  const active = useSharedValue("");
  const startIndex = useSharedValue(-1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const absX = useSharedValue(0);
  const absY = useSharedValue(0);
  const scrollStart = useSharedValue(0);
  const viewport = useSharedValue({ x: 0, y: 0, w: 0, h: 0 });
  const dropX = useSharedValue(0);
  const dropY = useSharedValue(0);
  const dropping = useSharedValue("");

  // Keep the UI-thread copy of the order in step while nothing is lifted.
  useEffect(() => {
    if (!active.value) orderSV.value = ids;
  }, [ids, active, orderSV]);

  const idsRef = useRef(ids);
  idsRef.current = ids;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const begin = useCallback((id: string) => {
    setDraggingId(id);
    setLiveOrder(idsRef.current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { /* no haptics */ });
  }, []);
  const moved = useCallback((next: string[]) => setLiveOrder(next), []);
  const end = useCallback((next: string[], committed: boolean) => {
    lastDropAt = Date.now();
    setDraggingId(null);
    setLiveOrder(null);
    const before = idsRef.current;
    const changed = next.length !== before.length || next.some((id, i) => id !== before[i]);
    if (committed && changed) commitRef.current(next);
  }, []);

  // Which slot the finger is over, by the slots captured at lift.
  const hitTest = useCallback(() => {
    "worklet";
    const id = active.value;
    if (!id) return;
    const s = slots.value;
    const from = s[startIndex.value];
    if (!from) return;
    const ds = scroll.value - scrollStart.value;
    const px = from.x + from.w / 2 + tx.value + (horizontal ? ds : 0);
    const py = from.y + from.h / 2 + ty.value + (horizontal ? 0 : ds);
    const ord = orderSV.value;
    const cur = ord.indexOf(id);
    for (let i = 0; i < s.length; i += 1) {
      const r = s[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        if (i !== cur) {
          const next = ord.slice();
          next.splice(cur, 1);
          next.splice(i, 0, id);
          orderSV.value = next;
          runOnJS(moved)(next);
        }
        return;
      }
    }
  }, [active, slots, startIndex, scroll, scrollStart, tx, ty, horizontal, orderSV, moved]);

  // Edge scrolling while lifted. Worked out in the scroller's own content
  // coordinates (the slots' space), against the visible window: no screen
  // measurement involved.
  const autoScroll = useFrameCallback(() => {
    "worklet";
    const id = active.value;
    if (!id) return;
    const v = viewport.value;
    const s = slots.value;
    const from = s[startIndex.value];
    if (!from || !(horizontal ? v.w : v.h)) return;
    const ds = scroll.value - scrollStart.value;
    const pointer = horizontal
      ? from.x + from.w / 2 + tx.value + ds - scroll.value
      : from.y + from.h / 2 + ty.value + ds - scroll.value;
    const size = horizontal ? v.w : v.h;
    let delta = 0;
    if (pointer < EDGE) delta = -Math.ceil((EDGE - pointer) / 5);
    else if (pointer > size - EDGE) delta = Math.ceil((pointer - (size - EDGE)) / 5);
    if (!delta) return;
    const next = Math.max(0, scroll.value + delta);
    if (next === scroll.value) return;
    if (horizontal) scrollTo(scrollRef, next, 0, false);
    else scrollTo(scrollRef, 0, next, false);
    hitTest();
  }, false);

  /** Give the scroller `onLayout={reorder.onViewportLayout}`: its visible size. */
  const onViewportLayout = useCallback((e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = e.nativeEvent.layout;
    viewport.value = { x: 0, y: 0, w: width, h: height };
  }, [viewport]);

  useEffect(() => {
    autoScroll.setActive(!!draggingId);
  }, [draggingId, autoScroll]);

  /**
   * Run `change` (a reset) with every item gliding to its new slot, staggered
   * in the new reading order. The transitions are switched on a frame before
   * the order changes so the layout change is the one they animate.
   */
  const animateChange = useCallback((change: () => void, nextIds?: string[]) => {
    const target = nextIds ?? idsRef.current;
    setResetIndex(new Map(target.map((id, i) => [id, Math.min(i, RESET_SLIDES.length - 1)])));
    requestAnimationFrame(() => change());
    setTimeout(() => setResetIndex(null), SLIDE_MS + RESET_SLIDES.length * STAGGER_MS + 120);
  }, []);

  const ctx: ReorderCtx = useMemo(() => ({
    disabled,
    horizontal,
    liftScale,
    draggingId,
    resetIndex,
    layouts,
    order: orderSV,
    slots,
    active,
    startIndex,
    tx,
    ty,
    absX,
    absY,
    scroll,
    scrollStart,
    viewport,
    dropX,
    dropY,
    dropping,
    scrollRef,
    begin,
    hitTest,
    end,
  }), [disabled, horizontal, liftScale, draggingId, resetIndex, layouts, orderSV, slots, active, startIndex, tx, ty, absX, absY, scroll, scrollStart, viewport, dropX, dropY, dropping, scrollRef, begin, hitTest, end]);

  return { order, draggingId, scrollRef, onViewportLayout, animateChange, ctx };
}

interface ItemProps {
  id: string;
  ctx: ReorderCtx;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ReorderItem({ id, ctx, children, style }: ItemProps) {
  const {
    disabled, horizontal, liftScale, draggingId, resetIndex, layouts, order, slots, active, startIndex, tx, ty, absX, absY,
    scroll, scrollStart, dropX, dropY, dropping, begin, hitTest, end,
  } = ctx;

  // This item's own scale: the press while it holds, the lift, the landing.
  const scale = useSharedValue(1);

  const gesture = useMemo(() => Gesture.Pan()
    .enabled(!disabled)
    .activateAfterLongPress(HOLD_MS)
    .onBegin(() => {
      "worklet";
      if (active.value) return;
      // Show the press; a scroll or a tap lets go of it in onFinalize.
      scale.value = withDelay(PRESS_DELAY, withTiming(PRESS_SCALE, { duration: HOLD_MS - PRESS_DELAY, easing: Easing.out(Easing.quad) }));
    })
    .onStart((e) => {
      "worklet";
      if (active.value) return;
      const ord = order.value;
      const all = layouts.value;
      const s: Rect[] = [];
      for (let i = 0; i < ord.length; i += 1) s.push(all[ord[i]] ?? { x: 0, y: 0, w: 0, h: 0 });
      slots.value = s;
      startIndex.value = ord.indexOf(id);
      scrollStart.value = scroll.value;
      tx.value = 0;
      ty.value = 0;
      absX.value = e.absoluteX;
      absY.value = e.absoluteY;
      dropping.value = "";
      active.value = id;
      // The lift grows out of the press: scale eases, position never does.
      scale.value = withTiming(liftScale, { duration: LIFT_MS, easing: EASE });
      runOnJS(begin)(id);
    })
    .onUpdate((e) => {
      "worklet";
      if (active.value !== id) return;
      tx.value = e.translationX;
      // A single row: the item slides along it, never off it.
      ty.value = horizontal ? 0 : e.translationY;
      absX.value = e.absoluteX;
      absY.value = e.absoluteY;
      hitTest();
    })
    .onFinalize(() => {
      "worklet";
      if (active.value !== id) {
        if (scale.value !== 1) scale.value = withTiming(1, { duration: 150, easing: EASE });
        return;
      }
      scale.value = withTiming(1, { duration: DROP_MS, easing: EASE });
      // Glide from where the finger left it into the slot it now owns.
      const s = slots.value;
      const ord = order.value;
      const cur = ord.indexOf(id);
      const from = s[startIndex.value];
      const to = s[cur];
      const ds = scroll.value - scrollStart.value;
      if (from && to) {
        dropX.value = tx.value + (horizontal ? ds : 0) - (to.x - from.x);
        dropY.value = ty.value + (horizontal ? 0 : ds) - (to.y - from.y);
        dropping.value = id;
        dropX.value = withTiming(0, { duration: DROP_MS, easing: EASE });
        dropY.value = withTiming(0, { duration: DROP_MS, easing: EASE });
      }
      active.value = "";
      runOnJS(end)(ord, true);
    }), [disabled, horizontal, liftScale, id, scale, active, order, layouts, slots, startIndex, scroll, scrollStart, tx, ty, absX, absY, dropX, dropY, dropping, begin, hitTest, end]);

  const lifted = useAnimatedStyle(() => {
    if (active.value !== id) {
      if (dropping.value === id) {
        return { zIndex: 50, transform: [{ translateX: dropX.value }, { translateY: dropY.value }, { scale: scale.value }] };
      }
      return { zIndex: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: scale.value }] };
    }
    const s = slots.value;
    const from = s[startIndex.value];
    const ds = scroll.value - scrollStart.value;
    if (!from) return { zIndex: 50, transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] };
    // Follow the finger, measured from whichever slot the item owns now.
    const to = s[order.value.indexOf(id)] ?? from;
    return {
      zIndex: 50,
      transform: [
        { translateX: tx.value + (horizontal ? ds : 0) - (to.x - from.x) },
        { translateY: ty.value + (horizontal ? 0 : ds) - (to.y - from.y) },
        { scale: scale.value },
      ],
    };
  });

  const onLayout = useCallback((e: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    // On the UI thread, in place: every item lays out in the same frame, and
    // a JS-side `{ ...layouts.value }` read each other's writes before they
    // landed, so only the last item kept its rect and nothing could be hit.
    layouts.modify(<T extends Record<string, Rect>>(all: T): T => {
      "worklet";
      (all as Record<string, Rect>)[id] = { x, y, w: width, h: height };
      return all;
    }, false);
  }, [id, layouts]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        onLayout={onLayout}
        layout={
          draggingId && draggingId !== id
            ? SLIDE
            : resetIndex
              ? RESET_SLIDES[resetIndex.get(id) ?? RESET_SLIDES.length - 1]
              : undefined
        }
        style={[style, lifted]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
