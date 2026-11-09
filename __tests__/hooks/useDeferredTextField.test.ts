import React, { useState } from "react";
import { act, create } from "react-test-renderer";
import { useDeferredTextField } from "../../hooks/useDeferredTextField";

type Field = ReturnType<typeof useDeferredTextField>;

function setup() {
  const sent: string[] = [];
  const state = { accept: true, field: null as Field | null, setValue: null as ((v: string) => void) | null };
  function Box(props: { value: string; onChangeText: (t: string) => void; onSubmit: () => void }) {
    state.field = useDeferredTextField(props.value, props.onChangeText, props.onSubmit);
    return null;
  }
  function Owner() {
    const [value, setValue] = useState("");
    state.setValue = setValue;
    return React.createElement(Box, {
      value,
      onChangeText: (t: string) => { if (state.accept) setValue(t); },
      onSubmit: () => sent.push(value),
    });
  }
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(React.createElement(Owner)); });
  return { sent, state, tree };
}

it("paints each key at once and lets the owner follow", () => {
  const { state, tree } = setup();
  act(() => state.field!.onChangeText("hi"));
  expect(state.field!.text).toBe("hi");
  act(() => tree.unmount());
});

it("sends the newest text even when the owner has not caught up", () => {
  const { sent, state, tree } = setup();
  act(() => state.field!.onChangeText("hi"));
  // The owner's transition has not landed the last key yet.
  state.accept = false;
  act(() => state.field!.onChangeText("hi!"));
  expect(state.field!.text).toBe("hi!");
  state.accept = true;
  act(() => state.field!.submit());
  expect(sent).toEqual(["hi!"]);
  act(() => tree.unmount());
});

it("takes a value the owner sets itself, such as clearing after a send", () => {
  const { state, tree } = setup();
  act(() => state.field!.onChangeText("hello"));
  act(() => state.setValue!(""));
  expect(state.field!.text).toBe("");
  act(() => tree.unmount());
});
