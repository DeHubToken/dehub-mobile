import React, { useCallback, useEffect, useState } from "react";
import { Keyboard, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSharedValue } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import FeedNavBar, { useFeedNavItems } from "./FeedNavBar";
import type { PostTypeOption } from "./FeedFilterPanel";
import { homeTabEvents } from "../../libs/eventBus";
import { ScreenNames } from "../../navigation/ScreenNames";
import HomeHeader from "../HomeHeader";
import { useDrawer } from "../../context/DrawerContext";

/**
 * Ordinary post pages retain the feed's pill, with Back in its filter slot.
 * `withLogo` also keeps the logo bar above it, so a text post opened from the
 * feed leaves both exactly where they were on the feed.
 */
export default function PostFeedNav({ onBack, withLogo = false }: { onBack: () => void; withLogo?: boolean }) {
  const navigation = useNavigation<any>();
  const { openDrawer } = useDrawer();
  const { t } = useTranslation();
  const items = useFeedNavItems();
  const [sourceTab] = useState(() => homeTabEvents.visibleTab());
  const activeIndex = Math.max(0, items.findIndex(item => item.postType === sourceTab));
  const progress = useSharedValue(activeIndex);
  useEffect(() => { progress.value = activeIndex; }, [activeIndex, progress]);

  const openFeed = useCallback((feedTab: PostTypeOption, openFeedFilters = false) => {
    Keyboard.dismiss();
    navigation.navigate({
      name: ScreenNames.Root,
      params: { screen: ScreenNames.Home, params: { feedTab, openFeedFilters } },
      pop: true,
    });
  }, [navigation]);
  const openFilters = useCallback(() => {
    openFeed(items[activeIndex].postType, true);
  }, [openFeed, items, activeIndex]);
  const handleBack = useCallback(() => {
    if (navigation.canGoBack?.()) onBack();
    else openFeed(items[activeIndex].postType);
  }, [navigation, onBack, openFeed, items, activeIndex]);

  return (
    <View testID="post-feed-nav">
      {withLogo ? (
        <HomeHeader onMenuPress={openDrawer} onLogoPress={handleBack} logoHint={t("common.goBack")} />
      ) : null}
      <FeedNavBar
        activeIndex={activeIndex}
        progress={progress}
        isFilterOpen={false}
        hasActiveFilters={false}
        onPostTypeChange={openFeed}
        onFilterPress={handleBack}
        onActiveTabLongPress={openFilters}
        backMode
        backLabel={t("common.goBack")}
        onBackPress={handleBack}
      />
    </View>
  );
}
