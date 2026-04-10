import React, { memo, useCallback } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import Icon, { type IconName } from "../ui/Icon";
import GlassIndicator, { GLASS_SHADOW } from "../ui/GlassIndicator";
import type { PostTypeOption } from "./FeedFilterPanel";

interface NavItem {
  icon: IconName;
  postType: PostTypeOption;
  tooltip: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: "House", postType: "all", tooltip: "Home" },
  { icon: "Video", postType: "video", tooltip: "Videos" },
  { icon: "Image", postType: "feed-images", tooltip: "Images" },
  { icon: "Film", postType: "feed-simple", tooltip: "Shorts" },
  { icon: "Mic", postType: "feed-audio", tooltip: "Music" },
  { icon: "Radio", postType: "live", tooltip: "Live" },
];

interface FeedNavBarProps {
  activePostType: PostTypeOption;
  isFilterOpen: boolean;
  hasActiveFilters: boolean;
  onPostTypeChange: (postType: PostTypeOption) => void;
  onFilterPress: () => void;
}

const NavButton = memo<{
  icon: IconName;
  active: boolean;
  tooltip: string;
  onPress: () => void;
}>(({ icon, active, tooltip, onPress }) => (
  <Pressable
    onPress={onPress}
    style={styles.navButton}
  >
    {({ pressed }) => (
      <>
        {active && (
          <View style={[StyleSheet.absoluteFill, { borderRadius: 12 }, GLASS_SHADOW]}>
            <GlassIndicator borderRadius={12} />
          </View>
        )}
        <View style={{ opacity: pressed ? 0.6 : 1 }}>
          <Icon
            name={icon}
            size={16}
            color={active ? "#FFFFFF" : "#71717A"}
            strokeWidth={active ? 2 : 1.8}
          />
        </View>
      </>
    )}
  </Pressable>
));

const FeedNavBar: React.FC<FeedNavBarProps> = ({
  activePostType,
  isFilterOpen,
  hasActiveFilters,
  onPostTypeChange,
  onFilterPress,
}) => {
  const handleNavPress = useCallback(
    (postType: PostTypeOption) => {
      onPostTypeChange(postType);
    },
    [onPostTypeChange],
  );

  return (
    <View style={styles.outerWrap}>
      <View style={styles.container}>
        <View style={styles.navRow}>
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.postType}
              icon={item.icon}
              active={activePostType === item.postType}
              tooltip={item.tooltip}
              onPress={() => handleNavPress(item.postType)}
            />
          ))}

          <Pressable
            onPress={onFilterPress}
            style={styles.navButton}
          >
            {({ pressed }) => {
              const filterActive = isFilterOpen || hasActiveFilters;
              return (
                <>
                  {filterActive && (
                    <View style={[StyleSheet.absoluteFill, { borderRadius: 12 }, GLASS_SHADOW]}>
                      <GlassIndicator borderRadius={12} />
                    </View>
                  )}
                  <View style={{ opacity: pressed ? 0.6 : 1 }}>
                    <Icon
                      name={isFilterOpen ? "X" : "Settings2"}
                      size={16}
                      color={filterActive ? "#FFFFFF" : "#71717A"}
                      strokeWidth={filterActive ? 2 : 1.8}
                    />
                  </View>
                </>
              );
            }}
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerWrap: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  container: {
    backgroundColor: "#18181B",
    borderRadius: 12,
    overflow: "hidden",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  navButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    position: "relative",
    overflow: "visible",
  },
});

export default memo(FeedNavBar);
