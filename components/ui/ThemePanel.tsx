import React from 'react';
import { View, StyleSheet, type ViewProps } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';
import { MINIMAL_HAIRLINE } from '../../theme/minimal';

/** A named card/picker surface; content colours and media retain their own fills. */
const ThemePanel = React.forwardRef<View, ViewProps & { solid?: boolean }>(({ children, style, solid, ...props }, ref) => {
  const { skin, isMinimal } = useAppTheme();
  const Surface = solid && skin ? require('./ThemeSurface').default : null;
  const geometry = Surface ? StyleSheet.flatten(style) : undefined;
  const material = skin ? {
    backgroundColor: skin.card.backgroundColor,
    borderWidth: skin.card.borderWidth,
    borderColor: skin.card.borderColor,
    borderTopColor: skin.card.borderTopColor,
  } : isMinimal ? { backgroundColor: '#000', borderColor: MINIMAL_HAIRLINE } : undefined;
  return <View ref={ref} {...props} style={[style, material, solid && skin ? {
    backgroundColor: skin.page,
    overflow: 'hidden',
    // Theme surfaces use their inset border as the edge. Avoid native drop
    // shadows that can be clipped by the rounded panel boundary and read as a
    // straight seam against the canvas.
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  } : undefined]}>
    {Surface ? <Surface radius={typeof geometry?.borderRadius === 'number' ? geometry.borderRadius : 0} /> : null}
    {children}
  </View>;
});

export default ThemePanel;
