import React, { useEffect, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { registerDockTarget } from '../../libs/magneticDock';

export default function DockLogoTarget({ children, tint, style }: { children: React.ReactNode; tint: string; style?: StyleProp<ViewStyle> }) {
  const view = useRef<View>(null);
  const focused = useIsFocused();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!focused) { setHidden(false); return; }
    return registerDockTarget(done => {
      if (!view.current) { done(null); return; }
      view.current.measureInWindow((x, y, width, height) => {
        done(width > 0 && height > 0 ? {
          x: x + (width - 42) / 2, y: y + (height - 36) / 2,
          width: 42, height: 36, tint, hide: setHidden,
        } : null);
      });
    });
  }, [focused, tint]);
  return <View ref={view} collapsable={false} style={[{ width: 44, height: 44 }, style, { opacity: hidden ? 0 : 1 }]}>{children}</View>;
}
