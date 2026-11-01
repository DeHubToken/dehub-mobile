/**
 * The post composer's text box.
 *
 * The composer screen is large, and a controlled TextInput waits for the whole
 * screen to re-render before it confirms each keystroke. While that render was
 * still running, the box could be handed an older value back, which moved the
 * caret and occasionally dropped a letter. This box keeps its own copy of the
 * text, so typing paints at once, and passes each change up as a transition the
 * screen can catch up with.
 *
 * A `value` from the screen that is not one of the box's own changes (a mention
 * filled in, an emoji, a draft loaded, the box cleared after posting) is taken
 * as is.
 */
import React, { memo, startTransition, useCallback, useEffect, useRef, useState } from "react";
import { TextInput, type TextInputProps } from "react-native";

type Props = Omit<TextInputProps, "value" | "onChangeText" | "defaultValue"> & {
  value: string;
  onChangeText: (text: string) => void;
  ref?: React.Ref<TextInput>;
};

const ComposerBodyInput = memo(function ComposerBodyInput({ value, onChangeText, ...rest }: Props) {
  const [text, setText] = useState(value);
  // Changes sent up that the screen has not echoed back yet, oldest first.
  const pending = useRef<string[]>([]);

  useEffect(() => {
    const at = pending.current.indexOf(value);
    if (at !== -1) {
      // Our own change coming back (or an older one the screen skipped past).
      pending.current = pending.current.slice(at + 1);
      return;
    }
    pending.current = [];
    setText(value);
  }, [value]);

  const handleChange = useCallback(
    (next: string) => {
      setText(next);
      pending.current.push(next);
      if (pending.current.length > 50) pending.current.shift();
      startTransition(() => onChangeText(next));
    },
    [onChangeText],
  );

  return <TextInput {...rest} value={text} onChangeText={handleChange} />;
});

export default ComposerBodyInput;
