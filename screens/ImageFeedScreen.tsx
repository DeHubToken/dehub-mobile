import React, { useCallback } from "react";
import { StatusBar, StyleSheet, View } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ImageFeedDrawer from "../components/Home/ImageFeedDrawer";
import type { UnifiedFeedItem } from "../services/feed.unified.service";

/**
 * Route host for the image drawer, used by the surfaces that open it from a
 * pushed screen rather than in place — the profile tabs. Home renders
 * ImageFeedDrawer directly inside HomeScreen instead, so its own nav bar keeps
 * working while the drawer is up.
 *
 * Presented as a transparentModal (see AppNavigator) so the screen behind still
 * shows in the strip above the sheet, and the only thing that animates is the
 * sheet itself.
 */
const ImageFeedScreen = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const {
    initialIndex = 0,
    initialItems = [],
    feedParams = {},
  } = (route?.params as any) || {};

  const handleClose = useCallback(() => navigation.goBack(), [navigation]);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ImageFeedDrawer
        initialItems={initialItems as UnifiedFeedItem[]}
        initialIndex={initialIndex}
        feedParams={feedParams}
        topInset={insets.top + 8}
        bottomInset={insets.bottom}
        onClose={handleClose}
      />
    </View>
  );
};

export default ImageFeedScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
