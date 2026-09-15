import React from "react";
import renderer, { act } from "react-test-renderer";
import { useItemState } from "../../hooks/useItemState";

// No react-native import: the test environment's style interop cannot stand
// up native components here, and the hook is pure React.
let bump: (() => void) | null = null;

function Cell({ id, initial }: { id: string; initial: number }) {
  const [n, setN] = useItemState(initial, id);
  bump = () => setN((v) => v + 1);
  return <>{`${id}:${n}`}</>;
}

describe("useItemState", () => {
  it("keeps state while the key is stable and resets when it changes", () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Cell id="a" initial={0} />);
    });
    act(() => bump!());
    expect(tree.toJSON()).toBe("a:1");
    act(() => tree.update(<Cell id="a" initial={0} />));
    expect(tree.toJSON()).toBe("a:1");
    act(() => tree.update(<Cell id="b" initial={5} />));
    expect(tree.toJSON()).toBe("b:5");
    act(() => bump!());
    expect(tree.toJSON()).toBe("b:6");
  });
});
