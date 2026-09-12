import React, { useMemo } from "react";
import { PanResponder, View, type ViewProps } from "react-native";

/** A header drag never competes with the sheet's form or native scroll view. */
export default function SheetDismissHandle({
  onClose, disabled = false, ...props
}: ViewProps & { onClose: () => void; disabled?: boolean }) {
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) =>
      !disabled && g.dy > 10 && g.dy > Math.abs(g.dx) * 1.5,
    onPanResponderRelease: (_, g) => {
      if (!disabled && (g.dy > 80 || (g.dy > 20 && g.vy > 0.7))) onClose();
    },
  }), [disabled, onClose]);
  return <View {...props} {...responder.panHandlers} />;
}
