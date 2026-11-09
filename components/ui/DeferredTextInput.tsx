import React, { memo, useCallback, useRef } from "react";
import { TextInput, type NativeSyntheticEvent, type TextInputProps, type TextInputSubmitEditingEventData } from "react-native";
import { useDeferredTextField } from "../../hooks/useDeferredTextField";

type Props = Omit<TextInputProps, "value" | "onChangeText"> & {
  value: string;
  onChangeText: (text: string) => void;
  ref?: React.Ref<TextInput>;
};

/**
 * A controlled TextInput for a box whose text lives in a large screen: each
 * key paints at once, the screen re-renders in a transition, and the keyboard's
 * own submit key (search, send) waits for the screen to have the last letters.
 * See hooks/useDeferredTextField.
 */
const DeferredTextInput = memo(function DeferredTextInput({ value, onChangeText, onSubmitEditing, ...rest }: Props) {
  const submitEvent = useRef<NativeSyntheticEvent<TextInputSubmitEditingEventData> | null>(null);
  const field = useDeferredTextField(
    value,
    onChangeText,
    onSubmitEditing ? () => { if (submitEvent.current) onSubmitEditing(submitEvent.current); } : undefined,
  );
  const { submit } = field;
  const handleSubmitEditing = useCallback((e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
    submitEvent.current = e;
    submit();
  }, [submit]);
  return (
    <TextInput
      {...rest}
      value={field.text}
      onChangeText={field.onChangeText}
      onSubmitEditing={onSubmitEditing ? handleSubmitEditing : undefined}
    />
  );
});

export default DeferredTextInput;
