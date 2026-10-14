export const QUICK_ACTIONS_HOLD_MS = 650;
type Touch = { nativeEvent: { pageX: number; pageY: number; touches?: unknown[] } };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let origin: { x: number; y: number } | null = null;
let blocked = false;
let enabled = true;

export function cancelQuickActions() { clearTimeout(timer); timer = undefined; origin = null; }
export function blockQuickActions() { blocked = true; cancelQuickActions(); }
function deferToPressable() { clearTimeout(timer); timer = undefined; }
export function setQuickActionsEnabled(value: boolean) { enabled = value; if (!value) cancelQuickActions(); }
export function openQuickActions() {
  cancelQuickActions();
  if (enabled && !blocked) listeners.forEach(listener => listener());
}
/** A surface can deliberately hand its existing hold to the page menu. */
export function requestQuickActions() { blocked = false; openQuickActions(); }
export function subscribeQuickActions(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function beginQuickActions(event: Touch) {
  cancelQuickActions(); blocked = false;
  if (!enabled || (event.nativeEvent.touches?.length ?? 1) > 1) { blocked = true; return false; }
  origin = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
  timer = setTimeout(openQuickActions, QUICK_ACTIONS_HOLD_MS);
  return false;
}
export function moveQuickActions(event: Touch) {
  if (origin && ((event.nativeEvent.touches?.length ?? 1) > 1 || Math.hypot(event.nativeEvent.pageX - origin.x, event.nativeEvent.pageY - origin.y) > 10)) blockQuickActions();
}

// The existing JSX bridge calls this before NativeWind changes component identity.
// Pressability owns button holds and suppresses their release tap.
// Scrollers are listed because Android's ScrollView takes the touch natively at
// the slop and JS never sees the move or the release, so without this the hold
// timer runs out mid-swipe and opens the menu on a plain scroll.
let types: { pressables: Set<unknown>; text: Set<unknown>; input: Set<unknown>; scrollers: Set<unknown> } | null = null;
function blockOnScroll(props: any) {
  return {
    ...props,
    onScrollBeginDrag: (...args: unknown[]) => { blockQuickActions(); return props.onScrollBeginDrag?.(...args); },
    onMomentumScrollBegin: (...args: unknown[]) => { blockQuickActions(); return props.onMomentumScrollBegin?.(...args); },
  };
}
export function withQuickActions(type: unknown, props: any) {
  if (!type || !props) return props;
  if (!types) {
    const RN = require('react-native');
    types = {
      pressables: new Set([RN.Pressable, RN.TouchableOpacity, RN.TouchableHighlight, RN.TouchableWithoutFeedback, RN.TouchableNativeFeedback]),
      text: new Set([RN.Text, RN.Animated?.Text]), input: new Set([RN.TextInput, RN.Animated?.TextInput]),
      scrollers: new Set([RN.ScrollView, RN.FlatList, RN.SectionList, RN.VirtualizedList, RN.Animated?.ScrollView, RN.Animated?.FlatList, RN.Animated?.SectionList].filter(Boolean)),
    };
    try {
      const GH = require('react-native-gesture-handler');
      [GH.ScrollView, GH.FlatList].forEach(scroller => scroller && types!.scrollers.add(scroller));
    } catch {}
  }
  if (types.scrollers.has(type)) return blockOnScroll(props);
  if (types.input.has(type) || (types.text.has(type) && props.selectable)) {
    return { ...props, onTouchStart: (...args: unknown[]) => { blockQuickActions(); return props.onTouchStart?.(...args); } };
  }
  if (types.pressables.has(type) || (types.text.has(type) && props.onPress)) {
    const owned = (!!props.onLongPress && props.onLongPress !== openQuickActions) || props.disabled || props.accessibilityRole === 'adjustable';
    return {
      ...props,
      onPressIn: (...args: unknown[]) => { owned ? blockQuickActions() : deferToPressable(); return props.onPressIn?.(...args); },
      onLongPress: props.onLongPress || (owned ? undefined : openQuickActions),
      delayLongPress: props.onLongPress ? props.delayLongPress : QUICK_ACTIONS_HOLD_MS,
    };
  }
  return props;
}
