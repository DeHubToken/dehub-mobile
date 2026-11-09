import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

interface DrawerActions {
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

interface DrawerContextValue extends DrawerActions {
  drawerOpen: boolean;
}

const noop = () => {};
const NO_ACTIONS: DrawerActions = { openDrawer: noop, closeDrawer: noop, toggleDrawer: noop };

const DrawerContext = createContext<DrawerContextValue>({ drawerOpen: false, ...NO_ACTIONS });
const DrawerActionsContext = createContext<DrawerActions>(NO_ACTIONS);

/** Open state and actions: re-renders whenever the drawer opens or closes. */
export const useDrawer = () => useContext(DrawerContext);

/**
 * Only the actions, which never change. A page that just opens the drawer
 * (Home's avatar) reads this, so opening it does not re-render the page:
 * Home re-rendering in the tap's own render held the drawer back ~0.2s.
 */
export const useDrawerActions = () => useContext(DrawerActionsContext);

export const DrawerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), []);

  const actions = useMemo(
    () => ({ openDrawer, closeDrawer, toggleDrawer }),
    [openDrawer, closeDrawer, toggleDrawer],
  );
  const value = useMemo(
    () => ({ drawerOpen, ...actions }),
    [drawerOpen, actions],
  );

  return (
    <DrawerActionsContext.Provider value={actions}>
      <DrawerContext.Provider value={value}>
        {children}
      </DrawerContext.Provider>
    </DrawerActionsContext.Provider>
  );
};
