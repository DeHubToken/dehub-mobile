/**
 * The Fractions tab on a profile.
 *
 * Reads the same on-chain portfolio as the Fractions screen's Portfolio tab.
 * It used to sum bought minus sold over trade rows, which showed a creator
 * none of the 1000 fractions they were minted and kept showing a position
 * after it had moved on-chain. On your own profile every tile is a shortcut
 * into selling it, and the empty state points at the market.
 */
import Animated from "react-native-reanimated";
import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { DeHubLoader } from "../DeHubLoader";
import { DeHubRefreshControl, DeHubRefreshMark } from "../Feed/DeHubRefreshControl";
import Icon from "../ui/Icon";
import ProfileEmptyState from "./ProfileEmptyState";
import { PositionTile } from "../Fractions/FractionPositionGrid";
import SellFractionsSheet, { type SellTarget } from "../Fractions/SellFractionsSheet";
import { padGrid } from "../Fractions/fractionFormat";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useFractionPortfolio, type PortfolioPosition } from "../../hooks/useFractionPortfolio";

interface FractionsRouteProps {
  address?: string;
  listRef?: React.RefObject<import("react-native").FlatList<any> | null>;
  isOwnProfile?: boolean;
  listHeader?: React.ReactElement | null;
  onScroll?: any;
}

const FractionsRoute: React.FC<FractionsRouteProps> = ({
  address,
  listRef,
  isOwnProfile,
  listHeader,
  onScroll,
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { hideUserProfile } = useUserProfileSheet();
  const [selling, setSelling] = useState<SellTarget | null>(null);
  const { data: positions = [], isLoading, isError, refetch, isRefetching } = useFractionPortfolio(address);

  const openPost = useCallback(
    (tokenId: string) => {
      hideUserProfile();
      navigation.navigate(ScreenNames.FeedDetail as never, { postId: tokenId } as never);
    },
    [navigation, hideUserProfile],
  );

  const openMarket = useCallback(() => {
    hideUserProfile();
    navigation.navigate(ScreenNames.Fractions as never);
  }, [navigation, hideUserProfile]);

  const sell = useCallback((p: PortfolioPosition) => {
    setSelling({
      tokenId: p.tokenId,
      chainId: p.chainId,
      post: { title: p.title || undefined, imageUrl: p.imageUrl || undefined, type: p.postType || undefined },
    });
  }, []);

  if (isLoading) {
    return (
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        {listHeader}
        <View style={styles.center}>
          <DeHubLoader size={56} />
        </View>
      </Animated.ScrollView>
    );
  }

  if (isError) {
    return (
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        {listHeader}
        <View style={styles.center}>
          <Icon name="CircleAlert" size={40} color="#4B5563" />
          <Text style={styles.errorText}>{t("fractions.loadFailed")}</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </TouchableOpacity>
        </View>
      </Animated.ScrollView>
    );
  }

  if (!address || positions.length === 0) {
    return (
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        {listHeader}
        <ProfileEmptyState
          kind="fractions"
          title={t("fractions.noFractionsYet")}
          subtitle={t(isOwnProfile ? "fractions.profileEmptyOwn" : "fractions.profileEmptyOther")}
        />
        {isOwnProfile && (
          <TouchableOpacity onPress={openMarket} style={styles.marketBtn}>
            <Text style={styles.retryText}>{t("fractions.browseTheMarket")}</Text>
          </TouchableOpacity>
        )}
      </Animated.ScrollView>
    );
  }

  const totalHeld = positions.reduce((sum, p) => sum + p.balance, 0);

  return (
    <View style={{ flex: 1 }}>
      <Animated.FlatList
        ref={listRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        data={padGrid(positions)}
        keyExtractor={(p, i) => (p ? `${p.chainId}-${p.tokenId}` : `spacer-${i}`)}
        renderItem={({ item }) => (
          <PositionTile position={item} onOpen={openPost} onSell={isOwnProfile ? sell : undefined} />
        )}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        ListHeaderComponent={
          <>
            {listHeader}
            <Text style={styles.count}>
              {t("fractions.fractionCount", { count: totalHeld })}{" "}
              {t("fractions.acrossPosts", { count: positions.length })}
            </Text>
          </>
        }
        refreshControl={<DeHubRefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#fff" />}
      />
      <DeHubRefreshMark refreshing={isRefetching} />
      {isOwnProfile && <SellFractionsSheet target={selling} onClose={() => setSelling(null)} />}
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  grid: { padding: 16, paddingBottom: 80, gap: 12 },
  row: { gap: 12 },
  count: { color: "#A6A9AC", fontSize: 12, marginBottom: 12 },
  errorText: { color: "#8B8D90", fontSize: 14, textAlign: "center" },
  retryBtn: { backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  marketBtn: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
});

export default FractionsRoute;
