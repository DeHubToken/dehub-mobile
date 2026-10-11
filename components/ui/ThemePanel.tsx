import React from 'react';
import { View, StyleSheet, type ViewProps } from 'react-native';
import { useAppTheme } from '../../context/ThemeContext';
import { MINIMAL_HAIRLINE } from '../../theme/minimal';
import ThemeSurface from './ThemeSurface';

/** A named card/picker surface; content colours and media retain their own fills. */
const ThemePanel = React.forwardRef<View, ViewProps & { solid?: boolean }>(({ children, style, solid, ...props }, ref) => {
  const { skin, isMinimal } = useAppTheme();
  const geometry = StyleSheet.flatten(style);
  const material = skin ? {
    backgroundColor: skin.card.backgroundColor,
    borderWidth: skin.card.borderWidth,
    borderColor: skin.card.borderColor,
    borderTopColor: skin.card.borderTopColor,
  } : isMinimal ? { backgroundColor: '#000', borderColor: MINIMAL_HAIRLINE } : undefined;
  return <View ref={ref} {...props} style={[style, material, solid && skin ? { backgroundColor: skin.page, overflow: 'hidden' } : undefined]}>
    {solid && skin ? <ThemeSurface radius={typeof geometry?.borderRadius === 'number' ? geometry.borderRadius : 0} /> : null}
    {children}
  </View>;
});

export default ThemePanel;
