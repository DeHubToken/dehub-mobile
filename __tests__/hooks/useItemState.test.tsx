import React from "react";
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { useItemState } from "../../hooks/useItemState";

function Cell({ id, initial }: { id: string; initial: number }) {
  const [n, setN] = useItemState(initial, id);
  return <Text onPress={() => setN((v) => v + 1)}>{`${id}:${n}`}</Text>;
}

describe("useItemState", () => {
  it("keeps state while the key is stable and resets when it changes", () => {
    let tree: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<Cell id="a" initial={0} />); });
    act(() => { tree!.root.findByType(Text).props.onPress(); });
    expect(tree!.toJSON()).toMatchObject({ children: ["a:1"] });
    act(() => { tree!.update(<Cell id="a" initial={0} />); });
    expect(tree!.toJSON()).toMatchObject({ children: ["a:1"] });
    act(() => { tree!.update(<Cell id="b" initial={5} />); });
    expect(tree!.toJSON()).toMatchObject({ children: ["b:5"] });
  });
});
