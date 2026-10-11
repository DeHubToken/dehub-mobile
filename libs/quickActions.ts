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
let types: { pressables: Set<unknown>; text: Set<unknown>; input: Set<unknown>; view: Set<unknown> } | null = null;
export function withQuickActions(type: unknown, props: any) {
  if (!props) return props;
  if (!types) {
    const RN = require('react-native');
    types = {
      pressables: new Set([RN.Pressable, RN.TouchableOpacity, RN.TouchableHighlight, RN.TouchableWithoutFeedback, RN.TouchableNativeFeedback]),
      text: new Set([RN.Text, RN.Animated?.Text]), input: new Set([RN.TextInput, RN.Animated?.TextInput]),
      view: new Set([RN.View, RN.Animated?.View]),
    };
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
  if (types.input.has(type) || (types.text.has(type) && props.selectable)) {
    return { ...props, onTouchStart: (...args: unknown[]) => { blockQuickActions(); return props.onTouchStart?.(...args); } };
  }
  return props;
}
