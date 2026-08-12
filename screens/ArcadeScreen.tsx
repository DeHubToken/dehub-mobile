/**
 * ArcadeScreen
 * ============
 * Native port of the web ArcadePage (/arcade) — the front door to every game
 * playable in the app. Reads `config/arcade-games` and shows all of them; the
 * card art is the same real capture the web cards use, not key art, because a
 * card that promises more than the game delivers is worse than no card.
 *
 * The registry is one game long on native and three on web, and the reason is
 * written out in `config/arcade-games.ts`. Nothing here assumes either count:
 * the grid is a list, so restoring a game there is the whole change.
 */
import React, { useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { ScreenNames } from "../navigation/ScreenNames";
import { ARCADE_GAMES, type ArcadeGame } from "../config/arcade-games";
import { colors } from "../theme/colors";

const GameCard = ({ game, onPress }: { game: ArcadeGame; onPress: (slug: string) => void }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={game.title}
    onPress={() => onPress(game.slug)}
    style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
  >
    <View style={styles.artWrap}>
      <Image
        source={{ uri: game.art }}
        accessibilityLabel={game.artAlt}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        // The capture is served with a year of `immutable` (dehubweb's
        // public/_headers), so it is worth holding on disk between sessions.
        cachePolicy="memory-disk"
        transition={200}
      />
      {/* Keeps the title legible over whatever the capture happens to be. */}
      <View style={styles.artScrim} pointerEvents="none" />
      <Text style={styles.artTitle} numberOfLines={1}>
        {game.title}
      </Text>
    </View>

    <View style={styles.cardBody}>
      <Text style={styles.description}>{game.description}</Text>
      <View style={styles.playButton}>
        <Icon name="Play" size={13} color={colors.accentForeground} />
        <Text style={styles.playLabel}>{game.action}</Text>
      </View>
    </View>
  </Pressable>
);

const ArcadeScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const openGame = useCallback(
    (slug: string) => navigation.navigate(ScreenNames.ArcadeGame, { slug }),
    [navigation],
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t("nav.arcade")} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>{t("arcade.intro")}</Text>

        {ARCADE_GAMES.map((game) => (
          <GameCard key={game.slug} game={game} onPress={openGame} />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.neutrals[900] },
  content: { paddingHorizontal: 12, paddingTop: 8, gap: 12 },
  intro: {
    color: "#A1A1AA",
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  cardPressed: { opacity: 0.85 },
  artWrap: {
    // The captures are 1280x720. Holding 16/9 means the art is never cropped
    // to a different shape than the one it was framed in.
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    justifyContent: "flex-end",
  },
  artScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  artTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
    padding: 14,
  },
  cardBody: { padding: 14, gap: 12 },
  description: { color: "#A1A1AA", fontSize: 12, lineHeight: 18 },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: colors.accent,
  },
  playLabel: {
    color: colors.accentForeground,
    fontSize: 12,
    fontWeight: "600",
  },
});

export default ArcadeScreen;
