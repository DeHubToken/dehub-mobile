/**
 * The two pieces the settings search jump needs on screen.
 *
 * `SettingsScrollView` is a drop-in for the `ScrollView` each settings panel
 * already uses — it hands its ref to the reveal store so a jump knows what to
 * scroll. Only one panel is mounted at a time, so one scroller is enough.
 *
 * `SettingsAnchor` wraps a section and does two things: reports its `y` inside
 * that scroll view (a direct child of the ScrollView, so `onLayout` is already
 * in content coordinates), and flashes when a search result points at it. The
 * flash is a white pulse, monochrome like the rest of the app, and it is what
 * turns "we switched your tab" into "this is the one".
 */
import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import {
  Animated,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native';
import Icon, { type IconName } from '../ui/Icon';
import { useAppTheme } from '../../context/ThemeContext';

import {
  registerSettingsAnchor,
  setSettingsScroller,
  subscribeSettingsHighlight,
  unregisterSettingsAnchor,
  getSettingsHighlight,
} from '../../libs/settings-search';

/**
 * The page bento web puts every settings surface in (`[data-page-bento]`,
 * `bg-zinc-900 rounded-2xl`): the theme's own card on the canvas themes,
 * nothing at all on minimal (web dissolves bentos into the page there).
 */
export function useSettingsBentoStyle(): ViewStyle {
  const { colors, isMinimal, skin, theme } = useAppTheme();
  if (skin) return skin.card;
  // Minimal and System (full immersive) have no bento: rows sit on the page.
  if (isMinimal || theme === 'system') return { backgroundColor: 'transparent', borderRadius: 0 };
  return { backgroundColor: colors.neutrals[800], borderRadius: 16 };
}

/**
 * The open tab's name and icon. Web heads every tab's bento with them
 * (`<Palette /> Appearance`); the settings screen provides it so each panel
 * does not have to draw its own.
 */
export const SettingsPanelContext = createContext<{ title: string; icon: IconName } | null>(
  null,
);

const PanelHeader: React.FC<{ title: string; icon: IconName }> = ({ title, icon }) => {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center mb-2" style={{ gap: 12 }}>
      <Icon name={icon} size={20} color={colors.neutrals[400]} />
      <Text className="text-white text-lg font-semibold">{title}</Text>
    </View>
  );
};

/**
 * True inside a settings page bento. The row primitives are also used outside
 * Settings (ConnectScreen), where there is no bento to sit on, and keep their
 * boxed card there.
 */
export const InSettingsBento = createContext(false);

/**
 * The bento is the scroll content container itself rather than a view inside
 * it, so every SettingsAnchor stays a direct child and its onLayout `y` is
 * still a scroll offset.
 */
export const SettingsScrollView: React.FC<ScrollViewProps> = ({
  children,
  contentContainerStyle,
  ...rest
}) => {
  const bento = useSettingsBentoStyle();
  const panel = useContext(SettingsPanelContext);
  // React detaches the outgoing panel's ref (calling this with null) before it
  // attaches the incoming one, so the switch lands in the right order. An
  // unmount effect clearing the scroller would not: passive cleanup runs after
  // the new panel has already registered, and would blank it again.
  const attach = useCallback((node: ScrollView | null) => {
    setSettingsScroller(node);
  }, []);

  return (
    <ScrollView
      ref={attach}
      keyboardShouldPersistTaps="handled"
      {...rest}
      contentContainerStyle={[
        contentContainerStyle,
        bento,
        { marginHorizontal: 8, marginTop: 8, marginBottom: 32, padding: 16, paddingBottom: 24 },
      ]}
    >
      <InSettingsBento.Provider value>
        {panel ? <PanelHeader title={panel.title} icon={panel.icon} /> : null}
        {children}
      </InSettingsBento.Provider>
    </ScrollView>
  );
};

export const SettingsAnchor: React.FC<{ id: string; children: React.ReactNode }> = ({
  id,
  children,
}) => {
  const glow = useRef(new Animated.Value(0)).current;

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => registerSettingsAnchor(id, e.nativeEvent.layout.y),
    [id],
  );

  useEffect(() => () => unregisterSettingsAnchor(id), [id]);

  useEffect(() => {
    const run = (highlight: ReturnType<typeof getSettingsHighlight>) => {
      if (highlight?.anchor !== id) {
        glow.stopAnimation();
        glow.setValue(0);
        return;
      }
      glow.setValue(0);
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 260, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0.35, duration: 320, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 1, duration: 320, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 700, useNativeDriver: false }),
      ]).start();
    };
    run(getSettingsHighlight());
    return subscribeSettingsHighlight(run);
  }, [glow, id]);

  return (
    <Animated.View
      onLayout={onLayout}
      style={{
        borderRadius: 18,
        // Colour interpolation cannot run on the native driver; the animation
        // is one short pulse, so the JS-driven frames are not a cost worth
        // designing around.
        backgroundColor: glow.interpolate({
          inputRange: [0, 1],
          outputRange: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.14)'],
        }),
      }}
    >
      {children}
    </Animated.View>
  );
};
