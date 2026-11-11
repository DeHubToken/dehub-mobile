import React, { useEffect, useRef } from "react";
import { Pressable, StyleSheet, TextInput } from "react-native";
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { TextInput as GestureTextInput } from "react-native-gesture-handler";
import Icon from "../ui/Icon";
import { usePageDrawerExpand } from "../common/PageDrawer";
import type { NotificationItem } from "../../services/user.service";

const OPEN = { duration: 300, easing: Easing.bezier(0.16, 1, 0.3, 1) };
const SHUT = { duration: 200, easing: Easing.bezier(0.4, 0, 1, 1) };

/** Whether a row matches a lowercased query: who did it, what it says, the post. */
export function notificationMatches(n: NotificationItem, query: string, sentence?: string): boolean {
  const extra = n as NotificationItem & { commentPreview?: string };
  return [
    n.actor?.displayName,
    n.actor?.username,
    n.actorUsername,
    ...(n.latestActorNames ?? []),
    sentence,
    n.content,
    n.tokenTitle,
    extra.commentPreview,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase()
    .includes(query);
}

/**
 * The bell's search, as on phone web: what the notifications pill turns into
 * when its search button is tapped. It grows out from the right, where the
 * button sat, and filters the rows already loaded. Focusing it fills the
 * screen, so the matches have room to scroll.
 */
export default function NotificationSearchLine({
  value,
  onChange,
  onClose,
  placeholder,
  closeLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  placeholder: string;
  closeLabel: string;
}) {
  const inputRef = useRef<TextInput>(null);
  const open = useSharedValue(0);
  const closing = useRef(false);
  const expand = usePageDrawerExpand();

  useEffect(() => {
    open.value = withTiming(1, OPEN);
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [open]);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    inputRef.current?.blur();
    open.value = withTiming(0, SHUT, (done) => { if (done) runOnJS(onClose)(); });
  };

  const style = useAnimatedStyle(() => ({
    opacity: open.value,
    transform: [{ translateX: 24 * (1 - open.value) }],
  }));

  return (
    <Reanimated.View style={[styles.row, style]}>
      <GestureTextInput
        ref={inputRef as unknown as React.Ref<any>}
        value={value}
        onChangeText={onChange}
        onFocus={() => expand?.()}
        placeholder={placeholder}
        placeholderTextColor="#808089"
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        onSubmitEditing={() => inputRef.current?.blur()}
        style={styles.input}
      />
      <Pressable onPress={close} style={styles.close} accessibilityRole="button" accessibilityLabel={closeLabel} hitSlop={6}>
        <Icon name="X" size={16} color="#A1A1AA" strokeWidth={1.8} />
      </Pressable>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row", alignItems: "center", minHeight: 36 },
  input: { flex: 1, minWidth: 0, height: 36, fontSize: 15, paddingHorizontal: 6, paddingVertical: 0, color: "#F4F4F5" },
  close: { width: 34, height: 30, alignItems: "center", justifyContent: "center" },
});
