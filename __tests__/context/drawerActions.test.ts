import React from "react";
import { act, create } from "react-test-renderer";
import { DrawerProvider, useDrawer, useDrawerActions } from "../../context/DrawerContext";

it("opens the drawer without re-rendering a page that only opens it", () => {
  const pageRenders = jest.fn();
  const drawerStates: boolean[] = [];
  let open!: () => void;
  function Page() {
    open = useDrawerActions().openDrawer;
    pageRenders();
    return null;
  }
  function Drawer() {
    drawerStates.push(useDrawer().drawerOpen);
    return null;
  }
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(React.createElement(DrawerProvider, null, React.createElement(Page), React.createElement(Drawer)));
  });
  pageRenders.mockClear();
  act(() => open());
  expect(pageRenders).not.toHaveBeenCalled();
  expect(drawerStates[drawerStates.length - 1]).toBe(true);
  act(() => tree.unmount());
});
